// supabase/functions/send-announcement-notifications/index.ts
//
// Doc 06 §6.3 — Announcements push delivery. Built alongside migration
// 0030 (resolve_announcement_recipients, announcement_deliveries,
// get_active_in_app_announcements) and 0031
// (publish_due_scheduled_announcements — a separate per-minute cron job
// that flips published_at when a scheduled announcement is due). This
// function only reacts to published_at already being set, however it got
// set (immediate publish, or a scheduled one firing via 0031) — it
// handles the 'push' channel only; 'email' remains unbuilt.
//
// Invocation: pg_cron + pg_net, every 5 minutes (migration 0030, Part 4) —
// same shape as send-impersonation-notifications (0026) and
// send-digest-notifications (0027): a queue-poll Edge Function, not a
// per-announcement synchronous call from the admin route. This keeps the
// admin's POST /api/admin/announcements route fast (it only inserts a row)
// and means a transient Expo Push API failure doesn't fail the admin's
// publish action — the next cron tick just retries whatever's still due.
//
// Due = published_at is not null and delivered_at is null. 'push' not in
// channels is still marked delivered_at immediately (nothing to send,
// not stuck forever showing as pending).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const JOB_NAME = 'send_announcement_notifications';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100; // Expo's own documented per-request cap

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: jobRun } = await admin
    .from('scheduled_job_runs')
    .insert({ job_name: JOB_NAME })
    .select('id')
    .single();

  let announcementsProcessed = 0;
  let pushesSent = 0;

  try {
    const { data: due, error: dueError } = await admin
      .from('announcements')
      .select('id, message, channels')
      .not('published_at', 'is', null)
      .is('delivered_at', null);
    if (dueError) throw dueError;

    for (const announcement of due ?? []) {
      if (!announcement.channels?.includes('push')) {
        // Nothing to send for this one (in_app-only or email-only) — still
        // mark delivered so it stops being picked up every 5 minutes.
        await admin
          .from('announcements')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', announcement.id);
        announcementsProcessed += 1;
        continue;
      }

      const { data: recipientRows, error: recipientsError } = await admin.rpc(
        'resolve_announcement_recipients',
        { p_announcement_id: announcement.id },
      );
      if (recipientsError) throw recipientsError;

      const recipientIds = (recipientRows ?? []).map((r: { user_id: string }) => r.user_id);
      if (recipientIds.length === 0) {
        await admin
          .from('announcements')
          .update({ delivered_at: new Date().toISOString() })
          .eq('id', announcement.id);
        announcementsProcessed += 1;
        continue;
      }

      // Skip anyone already logged for this announcement+channel — a prior
      // run may have partially completed (e.g. the function timed out
      // mid-way through a large recipient list).
      const { data: alreadyDelivered } = await admin
        .from('announcement_deliveries')
        .select('user_id')
        .eq('announcement_id', announcement.id)
        .eq('channel', 'push');
      const alreadyDeliveredIds = new Set((alreadyDelivered ?? []).map((r) => r.user_id));
      const pendingIds = recipientIds.filter((id: string) => !alreadyDeliveredIds.has(id));

      const { data: profiles, error: profilesError } = await admin
        .from('profiles')
        .select('id, expo_push_token')
        .in('id', pendingIds.length > 0 ? pendingIds : ['00000000-0000-0000-0000-000000000000']);
      if (profilesError) throw profilesError;

      const deliveryRows: {
        announcement_id: string;
        user_id: string;
        channel: string;
        status: string;
      }[] = [];
      const messagesToSend: { to: string; title: string; body: string }[] = [];
      const tokenToUserId = new Map<string, string>();

      for (const profile of profiles ?? []) {
        if (!profile.expo_push_token) {
          deliveryRows.push({
            announcement_id: announcement.id,
            user_id: profile.id,
            channel: 'push',
            status: 'skipped_no_token',
          });
          continue;
        }
        tokenToUserId.set(profile.expo_push_token, profile.id);
        messagesToSend.push({
          to: profile.expo_push_token,
          title: 'Dala',
          body: announcement.message,
        });
      }

      // Expo caps push requests at 100 messages — batch rather than one
      // giant request that could fail as a whole for a large broadcast.
      for (let i = 0; i < messagesToSend.length; i += EXPO_BATCH_SIZE) {
        const batch = messagesToSend.slice(i, i + EXPO_BATCH_SIZE);
        let batchOk = false;
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
          batchOk = res.ok;
        } catch {
          batchOk = false;
        }
        for (const msg of batch) {
          const userId = tokenToUserId.get(msg.to)!;
          deliveryRows.push({
            announcement_id: announcement.id,
            user_id: userId,
            channel: 'push',
            status: batchOk ? 'sent' : 'failed',
          });
          if (batchOk) pushesSent += 1;
        }
      }

      if (deliveryRows.length > 0) {
        // upsert, not insert — the unique(announcement_id, user_id, channel)
        // constraint means a re-run after a partial failure won't duplicate
        // rows for recipients already logged.
        await admin
          .from('announcement_deliveries')
          .upsert(deliveryRows, { onConflict: 'announcement_id,user_id,channel' });
      }

      await admin
        .from('announcements')
        .update({ delivered_at: new Date().toISOString() })
        .eq('id', announcement.id);
      announcementsProcessed += 1;
    }

    await admin
      .from('scheduled_job_runs')
      .update({ completed_at: new Date().toISOString(), status: 'success' })
      .eq('id', jobRun?.id);

    return new Response(JSON.stringify({ announcementsProcessed, pushesSent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await admin
      .from('scheduled_job_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
      })
      .eq('id', jobRun?.id);

    return new Response(JSON.stringify({ error: 'Échec du job announcements.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

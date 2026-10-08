// supabase/functions/send-announcement-notifications/index.ts
//
// Doc 06 §6.3 — Announcements push delivery. Built alongside migration
// 0030 (resolve_announcement_recipients, announcement_deliveries,
// get_active_in_app_announcements) and 0031
// (publish_due_scheduled_announcements — a separate per-minute cron job
// that flips published_at when a scheduled announcement is due). This
// function only reacts to published_at already being set, however it got
// set (immediate publish, or a scheduled one firing via 0031).
//
// ADMIN REMEDIATION TIER 2.2: email channel added (migration 0058 widened
// announcement_deliveries' channel CHECK to allow it). Recipients are
// resolved once per announcement and reused for both channels — the
// underlying audience for a given announcement doesn't change between
// checking "does this recipient get push" and "does this recipient get
// email," so there's no reason to call resolve_announcement_recipients()
// twice. Uses the same Resend _shared/resend.ts helper and call shape as
// send-organization-invitation-email (checked that function's exact
// sendEmail() call before writing this, per the remediation plan's own
// instruction). profiles has no email column (confirmed by reading 0002 —
// email lives on auth.users only), so email addresses are resolved via
// auth.admin.listUsers(), same pattern apps/admin's admins/route.ts
// already established this remediation phase for the identical problem.
//
// Invocation: pg_cron + pg_net, every 5 minutes (migration 0030, Part 4) —
// same shape as send-impersonation-notifications (0026) and
// send-digest-notifications (0027): a queue-poll Edge Function, not a
// per-announcement synchronous call from the admin route. This keeps the
// admin's POST /api/admin/announcements route fast (it only inserts a row)
// and means a transient Expo Push API / Resend failure doesn't fail the
// admin's publish action — the next cron tick just retries whatever's
// still due.
//
// Due = published_at is not null and delivered_at is null. A channel not
// in `channels` is simply skipped for that announcement — if neither
// push nor email is selected (in_app-only), delivered_at is still marked
// immediately (nothing to send, not stuck forever showing as pending).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { sendEmail } from '../_shared/resend.ts';
import { requireInternalCaller } from '../_shared/internalAuth.ts';

const JOB_NAME = 'send_announcement_notifications';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100; // Expo's own documented per-request cap

Deno.serve(async (req) => {
  // Internal-only: reject anyone who is not the platform (cron / service role).
  const denied = await requireInternalCaller(req);
  if (denied) return denied;

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
  let emailsSent = 0;

  try {
    const { data: due, error: dueError } = await admin
      .from('announcements')
      .select('id, message, channels')
      .not('published_at', 'is', null)
      .is('delivered_at', null);
    if (dueError) throw dueError;

    for (const announcement of due ?? []) {
      const wantsPush = announcement.channels?.includes('push') ?? false;
      const wantsEmail = announcement.channels?.includes('email') ?? false;

      if (!wantsPush && !wantsEmail) {
        // Nothing to send for this one (in_app-only) — still mark
        // delivered so it stops being picked up every 5 minutes.
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

      const deliveryRows: {
        announcement_id: string;
        user_id: string;
        channel: string;
        status: string;
      }[] = [];

      if (wantsPush) {
        pushesSent += await sendPushChannel(admin, announcement, recipientIds, deliveryRows);
      }

      if (wantsEmail) {
        emailsSent += await sendEmailChannel(admin, announcement, recipientIds, deliveryRows);
      }

      if (deliveryRows.length > 0) {
        // upsert, not insert — the unique(announcement_id, user_id, channel)
        // constraint means a re-run after a partial failure won't duplicate
        // rows for recipients already logged, for either channel.
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

    return new Response(JSON.stringify({ announcementsProcessed, pushesSent, emailsSent }), {
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

// deno-lint-ignore no-explicit-any
async function sendPushChannel(
  admin: any,
  announcement: { id: string; message: string },
  recipientIds: string[],
  deliveryRows: { announcement_id: string; user_id: string; channel: string; status: string }[],
): Promise<number> {
  let pushesSent = 0;

  // Skip anyone already logged for this announcement+channel — a prior
  // run may have partially completed (e.g. the function timed out
  // mid-way through a large recipient list).
  const { data: alreadyDelivered } = await admin
    .from('announcement_deliveries')
    .select('user_id')
    .eq('announcement_id', announcement.id)
    .eq('channel', 'push');
  const alreadyDeliveredIds = new Set((alreadyDelivered ?? []).map((r: any) => r.user_id));
  const pendingIds = recipientIds.filter((id: string) => !alreadyDeliveredIds.has(id));

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id, expo_push_token')
    .in('id', pendingIds.length > 0 ? pendingIds : ['00000000-0000-0000-0000-000000000000']);
  if (profilesError) throw profilesError;

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

  return pushesSent;
}

// deno-lint-ignore no-explicit-any
async function sendEmailChannel(
  admin: any,
  announcement: { id: string; message: string },
  recipientIds: string[],
  deliveryRows: { announcement_id: string; user_id: string; channel: string; status: string }[],
): Promise<number> {
  let emailsSent = 0;

  const { data: alreadyDelivered } = await admin
    .from('announcement_deliveries')
    .select('user_id')
    .eq('announcement_id', announcement.id)
    .eq('channel', 'email');
  const alreadyDeliveredIds = new Set((alreadyDelivered ?? []).map((r: any) => r.user_id));
  const pendingIds = recipientIds.filter((id: string) => !alreadyDeliveredIds.has(id));
  if (pendingIds.length === 0) return 0;

  // profiles has no email column — resolve via the Auth admin API, same
  // listUsers()-then-map pattern apps/admin's admins/route.ts already
  // uses for the same underlying problem (Tier 1.2). perPage: 1000, same
  // cap accepted there — this repo has no pagination story for
  // listUsers() anywhere yet, disclosed as a shared limitation rather
  // than solved twice, differently, in two places.
  const { data: authUsersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map<string, string>();
  for (const u of authUsersPage?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  for (const userId of pendingIds) {
    const email = emailById.get(userId);
    if (!email) {
      deliveryRows.push({
        announcement_id: announcement.id,
        user_id: userId,
        channel: 'email',
        status: 'skipped_no_token', // reused status value — "nothing to
        // deliver to" for this recipient/channel, same meaning as push's
        // "no expo token" case, not a distinct email-specific status
        // worth widening the CHECK constraint for.
      });
      continue;
    }

    try {
      await sendEmail({
        to: email,
        subject: 'Annonce Dala',
        html: `<p>${announcement.message}</p>`,
      });
      deliveryRows.push({
        announcement_id: announcement.id,
        user_id: userId,
        channel: 'email',
        status: 'sent',
      });
      emailsSent += 1;
    } catch (err) {
      console.error(
        `[send-announcement-notifications] email send failed for ${userId}:`,
        err instanceof Error ? err.message : err,
      );
      deliveryRows.push({
        announcement_id: announcement.id,
        user_id: userId,
        channel: 'email',
        status: 'failed',
      });
    }
  }

  return emailsSent;
}

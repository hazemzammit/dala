// supabase/functions/send-digest-notifications/index.ts
//
// Phase 5 — Doc 02 §2.9a daily/weekly digest. Doc 01 §1.19 doesn't exist to
// specify this in detail (confirmed before writing this file), so the
// content list below is Doc 02 §2.9a's own prose, not an invented spec.
//
// IMPORTANT — this is the FIRST actual scheduled-job Edge Function in this
// repo. Migrations 0013 and 0023 both reference "a Supabase cron Edge
// Function wrapping scheduled_job_runs bookkeeping" as an established
// pattern, but neither one — nor Phase 0's "keep-alive ping" nor Phase 3's
// "Storage-purge" mentioned in this phase's brief — actually exists as code
// anywhere in supabase/functions/ (confirmed by listing the directory
// before writing this). That pattern was documented in comments but never
// implemented. This file is the first real instance of it, not a reuse of
// existing code — worth knowing before assuming the referenced Phase 0/3
// jobs can be pointed to as a working example.
//
// Invocation: meant to be triggered by a Supabase cron schedule (Dashboard
// → Edge Functions → Cron, or a `supabase/config.toml` [functions.*] cron
// entry) — daily at a fixed local-morning time. This file only handles the
// "run once now" logic; wiring the actual cron trigger is a dashboard/CLI
// config step outside this codebase, not something to fake here.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { requireInternalCaller } from '../_shared/internalAuth.ts';

const JOB_NAME = 'send_digest_notifications';

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
    .select()
    .single();

  try {
    const today = new Date();
    const isMonday = today.getDay() === 1; // weekly digest goes out with Monday's daily run

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, expo_push_token, notification_prefs, active_org_id')
      .not('expo_push_token', 'is', null);
    if (profilesError) throw profilesError;

    let sent = 0;
    for (const profile of profiles ?? []) {
      const frequency = profile.notification_prefs?.digest_frequency ?? 'off';
      if (frequency === 'off') continue;
      if (frequency === 'weekly' && !isMonday) continue;
      if (!profile.active_org_id) continue;

      // digest_summary_for (0103), not get_digest_summary: the latter keys off
      // auth.uid(), which is NULL for this service-role client, so it matched no
      // membership and returned nothing — no digest push was ever sent. This
      // variant takes the recipient explicitly and returns NULL advance figures
      // for viewers, so the message below simply omits them.
      const { data: summary } = await admin
        .rpc('digest_summary_for', { p_org_id: profile.active_org_id, p_user_id: profile.id })
        .maybeSingle();
      if (!summary) continue;

      const messageParts: string[] = [];
      if (summary.pending_advances_count > 0) {
        messageParts.push(`${summary.pending_advances_count} avance(s) en attente`);
      }
      if (summary.pending_materials_count > 0) {
        messageParts.push(`${summary.pending_materials_count} demande(s) de matériaux`);
      }
      if (summary.tomorrow_dispatch_planned === false) {
        messageParts.push('dispatch de demain non planifié');
      }

      // A digest with nothing to say is worse than no digest — Doc 02
      // §2.9a's point is surfacing what needs attention, not a daily ping
      // for its own sake.
      if (messageParts.length === 0) continue;

      const pushResult = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: frequency === 'weekly' ? 'Résumé hebdomadaire' : 'Résumé quotidien',
          body: messageParts.join(' · '),
        }),
      });
      if (pushResult.ok) sent += 1;
    }

    await admin
      .from('scheduled_job_runs')
      .update({ completed_at: new Date().toISOString(), status: 'success' })
      .eq('id', jobRun?.id);

    return new Response(JSON.stringify({ sent }), {
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

    return new Response(JSON.stringify({ error: 'Échec du job digest.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

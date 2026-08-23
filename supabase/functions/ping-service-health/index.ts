// supabase/functions/ping-service-health/index.ts
//
// Doc 06 §6.3 — Services Health infra grid. See migration 0032's header
// for the Konnect scope cut. Invocation: pg_cron + pg_net, every 5
// minutes, same shared Vault secrets as 0026/0027/0030 (no new secret
// registered).
//
// Each check is a real network call against the actual service, not a
// simulated result:
//   - supabase_auth: Supabase Auth admin API, listUsers(page 1, perPage 1)
//     via the service-role client already used everywhere else in this
//     repo's Edge Functions.
//   - supabase_storage: Supabase Storage listBuckets().
//   - supabase_realtime: opens a Realtime channel and waits for the
//     SUBSCRIBED callback (websocket layer — genuinely independent of the
//     Auth/Storage REST paths above, see migration 0056's header for why
//     this isn't redundant with them). 3s timeout; the channel is closed
//     immediately after either outcome so a 5-min cron tick never leaks a
//     connection.
//   - resend: GET https://api.resend.com/domains with RESEND_API_KEY —
//     the same key supabase/functions/_shared/resend.ts already sends
//     real emails with.
//   - expo_push: POST https://exp.host/--/api/v2/push/send with an empty
//     message array. Expo has no dedicated health-check endpoint; getting
//     ANY HTTP response back (200 with an empty results array, or a 4xx)
//     counts as "up" — this checks reachability, not deeper service
//     health. Only a network-level failure (timeout, DNS, connection
//     refused) counts as "down".
//
// ADMIN REMEDIATION TIER 4.6 — PROACTIVE ALERTING, added to this same
// function per the plan's own instruction ("easiest integration point:
// have ping-service-health... also check whether any service flipped
// from up to down"). Two alert conditions, both Slack-webhook-based
// (picked one channel, not three, per the plan):
//   1. A service is currently 'down' and wasn't already alerted for this
//      incident (outage), or is currently 'up' and WAS previously
//      alerted (recovery) — see evaluateAlert() below for exactly how
//      this is decided from admin_alert_state, not a literal comparison
//      against the prior check row.
//   2. A monitored job's last two scheduled_job_runs rows are both
//      'failed' — the exact same MONITORED_JOBS list and lastTwoFailed
//      condition api/admin/services-health/route.ts already computes
//      client-side (copied here so it can actually fire a notification,
//      not just color a badge on a page nobody's looking at — same
//      MONITORED_JOBS array, duplicated rather than imported since this
//      is a separate Deno runtime with no shared-module story with the
//      Next.js app; keep the two lists in sync by hand if either changes).
// Debounce via admin_alert_state (migration 0063) — see that migration's
// header for why this needed a dedicated table rather than a column on
// either history table. ADMIN_ALERT_WEBHOOK_URL is a normal Edge Function
// secret (`supabase secrets set`), read via Deno.env.get() exactly like
// RESEND_API_KEY above — NOT a Vault entry (Vault here is reserved for
// the SQL-level cron_service_role_key/cron_edge_function_base_url pair
// 0026 registered, used inside raw pg_cron job bodies where there's no
// Deno runtime to read a normal env var from; this function DOES have
// one, so it uses the same mechanism RESEND_API_KEY already does). If
// unset, alerting silently no-ops (logged, not thrown) — a missing
// webhook URL should never take down the health checks themselves.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const RETENTION_DAYS = 7;
const REALTIME_TIMEOUT_MS = 3000;

// Mirrors api/admin/services-health/route.ts's MONITORED_JOBS exactly —
// see this file's header for why it's a duplicated list, not a shared one.
const MONITORED_JOBS = [
  'send_impersonation_notifications',
  'send_digest_notifications',
  'send_announcement_notifications',
  'audit_log_retention_cleanup',
  'edge_function_invocations_retention_cleanup',
  'totp_key_rotation',
  'snapshot_platform_metrics',
  // Tier 4.7 — email_delivery_events' own retention job (0064). Keep in
  // sync with api/admin/services-health/route.ts's own MONITORED_JOBS.
  'email_delivery_events_retention_cleanup',
];

async function sendAlert(message: string): Promise<void> {
  const webhookUrl = Deno.env.get('ADMIN_ALERT_WEBHOOK_URL');
  if (!webhookUrl) {
    console.log('[ping-service-health] ADMIN_ALERT_WEBHOOK_URL not set, skipping alert:', message);
    return;
  }
  try {
    // Slack incoming-webhook format ({ text }) — Discord's equivalent
    // field is `content`, not `text`; swapping providers is a one-line
    // change here, not a rearchitecture, per the plan's "pick one
    // channel" guidance.
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch (e) {
    console.error('[ping-service-health] failed to send alert webhook:', e);
  }
}

/**
 * Reads this entity's current admin_alert_state row (if any), decides
 * whether to fire an alert given the new observed state, and writes the
 * updated debounce state back. `isDown` is the entity's CURRENT bad/good
 * state (down, or lastTwoFailed) — not a transition; the transition is
 * computed here by comparing against alerted_at.
 */
async function evaluateAlert(
  admin: ReturnType<typeof createClient>,
  entityType: 'service' | 'job',
  entityName: string,
  isDown: boolean,
  downMessage: string,
  recoveryMessage: string,
): Promise<void> {
  const { data: state } = await admin
    .from('admin_alert_state')
    .select('alerted_at')
    .eq('entity_type', entityType)
    .eq('entity_name', entityName)
    .maybeSingle();

  const alreadyAlerted = state?.alerted_at != null;

  if (isDown && !alreadyAlerted) {
    await sendAlert(downMessage);
    await admin.from('admin_alert_state').upsert(
      {
        entity_type: entityType,
        entity_name: entityName,
        alerted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_name' },
    );
  } else if (!isDown && alreadyAlerted) {
    await sendAlert(recoveryMessage);
    await admin.from('admin_alert_state').upsert(
      {
        entity_type: entityType,
        entity_name: entityName,
        alerted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'entity_type,entity_name' },
    );
  }
  // isDown && alreadyAlerted → sustained outage, no re-alert (the whole
  // point of the debounce). !isDown && !alreadyAlerted → healthy,
  // nothing to do. Neither case writes anything.
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  return { ms: Math.round(performance.now() - start), result };
}

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const checks: {
    service_name: string;
    status: 'up' | 'down';
    latency_ms: number | null;
    error_message: string | null;
  }[] = [];

  // --- supabase_auth ---
  try {
    const { ms, result } = await timed(() => admin.auth.admin.listUsers({ page: 1, perPage: 1 }));
    if (result.error) throw new Error(result.error.message);
    checks.push({
      service_name: 'supabase_auth',
      status: 'up',
      latency_ms: ms,
      error_message: null,
    });
  } catch (e) {
    checks.push({
      service_name: 'supabase_auth',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- supabase_storage ---
  try {
    const { ms, result } = await timed(() => admin.storage.listBuckets());
    if (result.error) throw new Error(result.error.message);
    checks.push({
      service_name: 'supabase_storage',
      status: 'up',
      latency_ms: ms,
      error_message: null,
    });
  } catch (e) {
    checks.push({
      service_name: 'supabase_storage',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- supabase_realtime ---
  // No existing .channel()/.subscribe() call anywhere in this repo to
  // base this on (checked before writing it) — this is the first. Opens
  // a channel, resolves on the SUBSCRIBED callback or a 3s timeout,
  // whichever comes first, and always unsubscribes in `finally` so a
  // timed-out or errored attempt doesn't leave a connection open for the
  // next tick.
  {
    const start = performance.now();
    let settled = false;
    const channel = admin.channel(`health-check-${crypto.randomUUID()}`);
    try {
      const status = await new Promise<'SUBSCRIBED' | 'TIMEOUT' | 'ERROR'>((resolve) => {
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            resolve('TIMEOUT');
          }
        }, REALTIME_TIMEOUT_MS);

        channel.subscribe((channelStatus) => {
          if (settled) return;
          if (channelStatus === 'SUBSCRIBED') {
            settled = true;
            clearTimeout(timer);
            resolve('SUBSCRIBED');
          } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'CLOSED') {
            settled = true;
            clearTimeout(timer);
            resolve('ERROR');
          }
          // Any other transient status (e.g. 'TIMED_OUT' from the client
          // library itself) is left to fall through to our own timer.
        });
      });

      const ms = Math.round(performance.now() - start);
      if (status === 'SUBSCRIBED') {
        checks.push({
          service_name: 'supabase_realtime',
          status: 'up',
          latency_ms: ms,
          error_message: null,
        });
      } else {
        checks.push({
          service_name: 'supabase_realtime',
          status: 'down',
          latency_ms: null,
          error_message: status === 'TIMEOUT' ? 'Timeout (3s)' : 'Erreur de connexion au canal.',
        });
      }
    } catch (e) {
      checks.push({
        service_name: 'supabase_realtime',
        status: 'down',
        latency_ms: null,
        error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
      });
    } finally {
      await admin.removeChannel(channel);
    }
  }

  // --- resend ---
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY non configurée.');
    const { ms, result } = await timed(() =>
      fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${resendKey}` },
      }),
    );
    // Any HTTP response (even 401/403 from a bad key) means Resend itself
    // is reachable — an auth failure is a config problem, not an outage,
    // but still surfaced via error_message for visibility.
    checks.push({
      service_name: 'resend',
      status: 'up',
      latency_ms: ms,
      error_message: result.ok ? null : `HTTP ${result.status}`,
    });
  } catch (e) {
    checks.push({
      service_name: 'resend',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- expo_push ---
  try {
    const { ms } = await timed(() =>
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      }),
    );
    checks.push({ service_name: 'expo_push', status: 'up', latency_ms: ms, error_message: null });
  } catch (e) {
    checks.push({
      service_name: 'expo_push',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  await admin.from('service_health_checks').insert(checks);

  // Retention — prune anything older than RETENTION_DAYS on the same
  // tick, rather than a separate job for a table with no long-term audit
  // value (see migration 0032 comment).
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await admin.from('service_health_checks').delete().lt('checked_at', cutoff);

  // --- Tier 4.6 alerting: services ---
  // See evaluateAlert() above and this file's header for the debounce
  // logic (admin_alert_state-based, not a literal two-row diff).
  for (const check of checks) {
    await evaluateAlert(
      admin,
      'service',
      check.service_name,
      check.status === 'down',
      `🔴 Dala admin: *${check.service_name}* est en panne. ${check.error_message ?? ''}`,
      `🟢 Dala admin: *${check.service_name}* est rétabli.`,
    );
  }

  // --- Tier 4.6 alerting: jobs ---
  // Same "last two runs both failed" condition
  // api/admin/services-health/route.ts already computes for the badge —
  // copied here (see this file's header) so it can actually notify.
  const { data: jobRuns } = await admin
    .from('scheduled_job_runs')
    .select('job_name, status, started_at')
    .in('job_name', MONITORED_JOBS)
    .order('started_at', { ascending: false })
    .limit(300);

  const runsByJob = new Map<string, { status: string }[]>();
  for (const run of jobRuns ?? []) {
    const list = runsByJob.get(run.job_name as string) ?? [];
    list.push(run as { status: string });
    runsByJob.set(run.job_name as string, list);
  }

  for (const jobName of MONITORED_JOBS) {
    const runs = runsByJob.get(jobName) ?? [];
    const lastTwoFailed =
      runs.length >= 2 && runs[0].status === 'failed' && runs[1].status === 'failed';
    await evaluateAlert(
      admin,
      'job',
      jobName,
      lastTwoFailed,
      `🔴 Dala admin: le job *${jobName}* a échoué deux fois de suite.`,
      `🟢 Dala admin: le job *${jobName}* a repris son fonctionnement normal.`,
    );
  }

  return new Response(JSON.stringify({ checks }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

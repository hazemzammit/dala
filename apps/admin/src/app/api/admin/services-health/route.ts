/**
 * Doc 06 §6.3 — Services Health.
 *
 * Two independent data sources:
 *   1. Scheduled-job status — real, backed by `scheduled_job_runs`
 *      (migration 0010). MONITORED_JOBS below was corrected in a prior
 *      session: it previously listed five job names
 *      ('expire_invitations', 'send_payment_reminders',
 *      'weekly_salary_summaries', 'cleanup_orphaned_files',
 *      'realtime_edge_function_usage_budget_check') that don't match any
 *      job_name any real Edge Function in this repo actually inserts —
 *      a stale placeholder list, silently monitoring nothing. The three
 *      real cron-invoked jobs (0026, 0027, 0030) weren't in it at all.
 *      This remediation phase added a fourth real one,
 *      'audit_log_retention_cleanup' (0053). cleanup_orphaned_files() now
 *      exists for real too (0051), but stays deliberately OFF this list —
 *      it's on-demand only (Doc 04 §4.3.8), never scheduled, so it never
 *      produces a scheduled_job_runs row to monitor.
 *   2. Infra reachability grid — real as of migration 0032, backed by
 *      `service_health_checks` (ping-service-health, cron every 5 min).
 *      0056 (Tier 1.3) added supabase_realtime to the checked set.
 *      Konnect is deliberately absent — see that migration's header, and
 *      note it's STILL absent after this phase: paymentProvider.ts's
 *      Konnect branch is still a stub that throws (confirmed by reading
 *      it), not real provider-calling code, despite migration 0043
 *      existing — there's genuinely nothing real to ping yet.
 *
 * Tier 4.6 — MONITORED_JOBS below is duplicated (not imported) into
 * supabase/functions/ping-service-health/index.ts, which uses the same
 * list + lastTwoFailed condition to actually fire a Slack alert on
 * failure, not just color this screen's badge. Keep both lists in sync
 * by hand if either changes — no shared-module story between this
 * Next.js app and that separate Deno runtime.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const MONITORED_JOBS = [
  'send_impersonation_notifications',
  'send_digest_notifications',
  'send_announcement_notifications', // Added this remediation phase — 0053's daily pg_cron job, the only
  // real caller of cleanup_audit_log_retention(). cleanup_orphaned_files()
  // (0051) is deliberately NOT listed here: it's on-demand only (Doc 04
  // §4.3.8 — triggered by an admin button, never scheduled), so it never
  // writes a scheduled_job_runs row to monitor.
  'audit_log_retention_cleanup',
  // Tier 2.1's own oversight, fixed here while touching this array again
  // for Tier 2.7: 0057's daily retention job was scheduled but never
  // added to this list, so it was silently unmonitored since that tier.
  'edge_function_invocations_retention_cleanup',
  // Tier 2.7 — rotate-totp-encryption-key (0061), twice-yearly. A failed
  // rotation should show up here the same way every other job failure
  // does, even though it fires far less often than the others on this list.
  'totp_key_rotation',
  // Tier 4.5 Phase A — snapshot_platform_metrics (0062), daily. Feeds
  // platform_metrics_daily; a silently-failing snapshot would mean a
  // future Phase B trend chart has a gap for that day with nothing
  // flagging why.
  'snapshot_platform_metrics',
  // Tier 4.7 — email_delivery_events' own daily retention job (0064),
  // same pattern as audit_log/edge_function_invocations' retention jobs
  // above.
  'email_delivery_events_retention_cleanup',
];

const MONITORED_SERVICES = [
  'supabase_auth',
  'supabase_storage',
  'supabase_realtime',
  'resend',
  'expo_push',
] as const;

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: runs, error } = await supabase
    .from('scheduled_job_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Latest run + last-two-runs (for the "2 consecutive failures" escalation
  // rule, §4.3.9) per job name.
  const byJob = new Map<string, typeof runs>();
  for (const run of runs ?? []) {
    const list = byJob.get(run.job_name as string) ?? [];
    list.push(run);
    byJob.set(run.job_name as string, list);
  }

  const jobs = MONITORED_JOBS.map((name) => {
    const jobRuns = byJob.get(name) ?? [];
    const latest = jobRuns[0] ?? null;
    const lastTwoFailed =
      jobRuns.length >= 2 && jobRuns[0].status === 'failed' && jobRuns[1].status === 'failed';
    return { job_name: name, latest, lastTwoFailed, recentRuns: jobRuns.slice(0, 5) };
  });

  const { data: healthChecks, error: healthError } = await supabase
    .from('service_health_checks')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(200);

  if (healthError) return NextResponse.json({ error: healthError.message }, { status: 500 });

  const latestByService = new Map<string, (typeof healthChecks)[number]>();
  for (const check of healthChecks ?? []) {
    if (!latestByService.has(check.service_name)) {
      latestByService.set(check.service_name, check);
    }
  }

  const services = MONITORED_SERVICES.map((name) => ({
    service_name: name,
    latest: latestByService.get(name) ?? null,
  }));

  return NextResponse.json({ jobs, services });
}

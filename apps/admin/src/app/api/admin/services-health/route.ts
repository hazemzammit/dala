/**
 * Doc 06 §6.3 — Services Health.
 *
 * Two independent data sources:
 *   1. Scheduled-job status — real, backed by `scheduled_job_runs`
 *      (migration 0010). MONITORED_JOBS below was corrected this
 *      session: it previously listed five job names
 *      ('expire_invitations', 'send_payment_reminders',
 *      'weekly_salary_summaries', 'cleanup_orphaned_files',
 *      'realtime_edge_function_usage_budget_check') that don't match any
 *      job_name any real Edge Function in this repo actually inserts —
 *      a stale placeholder list, silently monitoring nothing. The three
 *      real cron-invoked jobs (0026, 0027, 0030) weren't in it at all.
 *   2. Infra reachability grid — real as of migration 0032, backed by
 *      `service_health_checks` (ping-service-health, cron every 5 min).
 *      Konnect is deliberately absent — see that migration's header.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const MONITORED_JOBS = [
  'send_impersonation_notifications',
  'send_digest_notifications',
  'send_announcement_notifications',
];

const MONITORED_SERVICES = ['supabase_auth', 'supabase_storage', 'resend', 'expo_push'] as const;

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

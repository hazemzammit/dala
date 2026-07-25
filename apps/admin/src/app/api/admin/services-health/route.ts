/**
 * Doc 04 §4.3.9 — scheduled-job status table, backed directly by
 * `scheduled_job_runs` (migration 0010), one row per execution.
 *
 * The infrastructure status grid (Supabase API/Auth/Storage/Realtime,
 * Edge Functions, Konnect, Resend, Expo Push) and the edge-function
 * invocation log are NOT built here — those need either a real uptime-
 * ping mechanism per service or a log source Doc 01 doesn't define yet
 * (no `edge_function_invocations` table exists). Wiring up fake "green"
 * indicators for services with no real check behind them would be
 * actively misleading, so the grid is left as a documented gap on the
 * page rather than faked.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const MONITORED_JOBS = [
  'expire_invitations',
  'send_payment_reminders',
  'weekly_salary_summaries',
  'cleanup_orphaned_files',
  'realtime_edge_function_usage_budget_check',
];

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

  return NextResponse.json({ jobs });
}

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.5, Phase A — platform_metrics_daily +
 * snapshot_platform_metrics() (migration 0062). No Edge Function to
 * invoke here (unlike most cron jobs in this repo, this one is pure SQL,
 * same as cleanup_audit_log_retention/cleanup_edge_function_invocations)
 * — so, unusually for this suite, the RPC itself IS directly callable
 * and testable, not just its schema.
 */
test.describe('Platform metrics snapshot', () => {
  test('snapshot_platform_metrics() writes a row matching Dashboard\u2019s own numbers', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: rpcError } = await supabase.rpc('snapshot_platform_metrics');
    expect(rpcError).toBeNull();

    const today = new Date().toISOString().slice(0, 10);
    const { data: snapshot } = await supabase
      .from('platform_metrics_daily')
      .select('*')
      .eq('snapshot_date', today)
      .single();

    expect(snapshot).not.toBeNull();
    // Sanity-checked against real counts, not just "a row exists" — this
    // suite's own global-setup.ts always creates at least one org and a
    // couple of profiles, so these should never be zero regardless of
    // what other tests ran first.
    expect(snapshot!.org_count).toBeGreaterThanOrEqual(1);
    expect(snapshot!.user_count).toBeGreaterThanOrEqual(1);
    expect(snapshot!.mrr_millimes).toBeGreaterThanOrEqual(0);
    expect(snapshot!.storage_bytes).toBeGreaterThanOrEqual(0);

    // Cross-check against the actual live org count, not a fixed
    // expectation — proves the function is really counting `organizations`
    // right now, not returning a stale or hardcoded number.
    const { count: liveOrgCount } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true });
    expect(snapshot!.org_count).toBe(liveOrgCount);
  });

  test('re-running the same day upserts in place — one row per day, not a duplicate', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const today = new Date().toISOString().slice(0, 10);

    await supabase.rpc('snapshot_platform_metrics');
    await supabase.rpc('snapshot_platform_metrics');

    const { data: rows, error } = await supabase
      .from('platform_metrics_daily')
      .select('snapshot_date')
      .eq('snapshot_date', today);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
  });

  test('writes a scheduled_job_runs row (surfaced on Services Health)', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    await supabase.rpc('snapshot_platform_metrics');

    const { data: jobRuns } = await supabase
      .from('scheduled_job_runs')
      .select('status')
      .eq('job_name', 'snapshot_platform_metrics')
      .gte('started_at', since);
    expect(jobRuns?.some((r) => r.status === 'success')).toBe(true);
  });

  test('platform_metrics_daily is service_role-only (no client/anon access)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await anonClient.from('platform_metrics_daily').select('*').limit(1);
    expect(error).not.toBeNull();
  });
});

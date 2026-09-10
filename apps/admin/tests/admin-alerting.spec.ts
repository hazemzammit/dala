import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.6 — proactive alerting. Cannot invoke
 * ping-service-health directly (same disclosed limitation as every other
 * Edge-Function-only feature this suite has hit) or observe the actual
 * Slack webhook call it makes. What this file covers directly, via the
 * service-role client: the admin_alert_state table's shape and the
 * debounce logic's data contract — evaluateAlert()'s decision rule is
 * "isDown && no existing alerted_at → alert" / "!isDown && existing
 * alerted_at → recovery alert," which this suite exercises by writing
 * the same states that function would read/write and confirming the
 * table behaves as that logic depends on.
 */
test.describe('Admin alerting — state table', () => {
  test('admin_alert_state is service_role-only (no client/anon access)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await anonClient.from('admin_alert_state').select('*').limit(1);
    expect(error).not.toBeNull();
  });

  test('rejects an invalid entity_type', async ({ page }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase.from('admin_alert_state').insert({
      entity_type: 'not_a_real_type',
      entity_name: 'test',
    });
    expect(error).not.toBeNull();
  });

  test('upsert on (entity_type, entity_name) updates in place — one row, not a duplicate', async ({
    page,
  }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const entityName = `e2e-test-service-${Date.now()}`;

    try {
      await supabase
        .from('admin_alert_state')
        .upsert(
          { entity_type: 'service', entity_name: entityName, alerted_at: new Date().toISOString() },
          { onConflict: 'entity_type,entity_name' },
        );
      // Simulates evaluateAlert()'s recovery path: same key, alerted_at
      // cleared — this is the exact write that stops a resolved incident
      // from looking perpetually "down" to the next tick's read.
      await supabase
        .from('admin_alert_state')
        .upsert(
          { entity_type: 'service', entity_name: entityName, alerted_at: null },
          { onConflict: 'entity_type,entity_name' },
        );

      const { data: rows } = await supabase
        .from('admin_alert_state')
        .select('alerted_at')
        .eq('entity_type', 'service')
        .eq('entity_name', entityName);

      expect(rows).toHaveLength(1);
      const firstRow = rows?.[0];
      if (!firstRow) throw new Error('Expected an admin alert state row');
      expect(firstRow.alerted_at).toBeNull();
    } finally {
      await supabase
        .from('admin_alert_state')
        .delete()
        .eq('entity_type', 'service')
        .eq('entity_name', entityName);
    }
  });

  test('MONITORED_JOBS list is consistent between services-health route and this suite\u2019s known jobs', async ({
    page,
  }) => {
    // Not a test of ping-service-health's own duplicated copy (can't
    // read that Deno-side constant from here) — this instead confirms
    // the Next.js-side list api/admin/services-health/route.ts exposes
    // still includes every job this remediation effort has added,
    // which is the list ping-service-health's copy needs to be kept in
    // sync with by hand (see that function's own header).
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);

    for (const expected of [
      'audit_log_retention_cleanup',
      'edge_function_invocations_retention_cleanup',
      'totp_key_rotation',
      'snapshot_platform_metrics',
    ]) {
      expect(jobNames).toContain(expected);
    }
  });
});

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 06 §6.3 — Services Health. No spec existed for this screen before
 * this remediation phase.
 *
 * Konnect is deliberately NOT asserted as monitored here — confirmed by
 * reading supabase/functions/_shared/paymentProvider.ts before writing
 * this spec that its Konnect branch is still a stub that throws, not
 * real provider-calling code, so there is genuinely nothing to ping yet
 * (see services-health/route.ts's header for the full reasoning). A test
 * asserting Konnect appears here would be asserting a fabrication.
 */
test.describe('Services Health', () => {
  test('read-only for every role, including support', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/services-health');
      expect(res.ok()).toBeTruthy();
    }
  });

  test('audit_log_retention_cleanup is a monitored job (added this phase)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);
    expect(jobNames).toContain('audit_log_retention_cleanup');
  });

  test('edge_function_invocations_retention_cleanup is a monitored job (Tier 2.1 fix)', async ({
    page,
  }) => {
    // This job (0057) was scheduled but never added to MONITORED_JOBS
    // until Tier 2.7 touched this same array again and caught it.
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);
    expect(jobNames).toContain('edge_function_invocations_retention_cleanup');
  });

  test('totp_key_rotation is a monitored job (Tier 2.7)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);
    expect(jobNames).toContain('totp_key_rotation');
  });

  test('snapshot_platform_metrics is a monitored job (Tier 4.5 Phase A)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);
    expect(jobNames).toContain('snapshot_platform_metrics');
  });

  test('email_delivery_events_retention_cleanup is a monitored job (Tier 4.7)', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const jobNames = (body.jobs ?? []).map((j: { job_name: string }) => j.job_name);
    expect(jobNames).toContain('email_delivery_events_retention_cleanup');
  });

  test('infra grid never lists konnect — nothing real to ping yet', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const serviceNames = (body.services ?? []).map((s: { service_name: string }) => s.service_name);
    expect(serviceNames).not.toContain('konnect');
  });

  test('supabase_realtime is a monitored service (Tier 1.3)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const serviceNames = (body.services ?? []).map((s: { service_name: string }) => s.service_name);
    // Only asserts the route reports the service as monitored — the
    // actual reachability ping runs inside ping-service-health (a Deno
    // Edge Function invoked by pg_cron), which this Playwright suite has
    // no mechanism to invoke directly, same limitation the existing
    // konnect/audit_log_retention_cleanup tests in this file already
    // work within.
    expect(serviceNames).toContain('supabase_realtime');
  });
});

/**
 * Admin remediation Tier 2.1 — Edge Function invocation log
 * (edge_function_invocations, migration 0057). Seeds its own rows directly
 * via the service-role client (same pattern as organizations.spec.ts's
 * restore test) rather than actually invoking a real Edge Function —
 * Playwright has no mechanism to invoke a Deno function here, same
 * limitation the existing supabase_realtime/konnect tests above already
 * work within.
 */
test.describe('Services Health — invocation log', () => {
  test('filters by function_name and status, and paginates', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const marker = `e2e-invocation-log-${Date.now()}`;
    const rows = [
      { function_name: marker, status: 'success', duration_ms: 120, error_message: null },
      { function_name: marker, status: 'error', duration_ms: null, error_message: 'boom' },
    ];

    try {
      const { error: insertError } = await supabase.from('edge_function_invocations').insert(rows);
      expect(insertError).toBeNull();

      await loginAsAdmin(page, fixtures.adminA);

      const allRes = await page.request.get(
        `/api/admin/services-health/invocations?functionName=${marker}`,
      );
      const allBody = await allRes.json();
      expect(allBody.invocations).toHaveLength(2);
      expect(allBody.total).toBe(2);

      const successRes = await page.request.get(
        `/api/admin/services-health/invocations?functionName=${marker}&status=success`,
      );
      const successBody = await successRes.json();
      expect(successBody.invocations).toHaveLength(1);
      expect(successBody.invocations[0].status).toBe('success');

      const pagedRes = await page.request.get(
        `/api/admin/services-health/invocations?functionName=${marker}&pageSize=1&page=2`,
      );
      const pagedBody = await pagedRes.json();
      expect(pagedBody.invocations).toHaveLength(1);
      expect(pagedBody.page).toBe(2);
      expect(pagedBody.total).toBe(2);
    } finally {
      await supabase.from('edge_function_invocations').delete().eq('function_name', marker);
    }
  });

  test('read-only for every role, including support', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/services-health/invocations');
      expect(res.ok()).toBeTruthy();
    }
  });
});

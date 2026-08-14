import { test, expect } from '@playwright/test';

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

  test('infra grid never lists konnect — nothing real to ping yet', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/services-health');
    const body = await res.json();
    const serviceNames = (body.services ?? []).map((s: { service_name: string }) => s.service_name);
    expect(serviceNames).not.toContain('konnect');
  });
});

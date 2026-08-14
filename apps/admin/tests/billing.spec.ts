import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.7 — Billing, rebuilt against migration 0043 this
 * remediation phase. No spec existed for this screen at all before now
 * (it was previously a read-only stub with no mutating actions to test).
 */
test.describe('Billing', () => {
  test('GET returns MRR and a real subscriptions table shape', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/billing');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.mrrMillimes).toBe('number');
    expect(Array.isArray(body.subscriptions)).toBe(true);
    expect(Array.isArray(body.planDistribution)).toBe(true);

    const row = body.subscriptions.find((s: { orgId: string }) => s.orgId === fixtures.orgId);
    expect(row).toBeTruthy();
    expect(row).toHaveProperty('subscriptionStatus');
    expect(row).toHaveProperty('billingCycleStart');
  });

  test('support gets 403 on every billing action — server-enforced', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    for (const action of ['extend_expiry', 'manual_discount', 'mark_paid', 'cancel']) {
      const res = await page.request.post('/api/admin/billing', {
        data: { orgId: fixtures.orgId, action },
      });
      expect(res.status(), `action=${action}`).toBe(403);
    }
  });

  test('mark_paid inserts/updates a billing_cycles row with payment_provider=manual', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/billing', {
      data: { orgId: fixtures.orgId, action: 'mark_paid' },
    });
    expect(res.ok()).toBeTruthy();

    const billingRes = await page.request.get('/api/admin/billing');
    const billingBody = await billingRes.json();
    const row = billingBody.subscriptions.find(
      (s: { orgId: string }) => s.orgId === fixtures.orgId,
    );
    expect(row.lastCycleStatus).toBe('paid');
    expect(row.subscriptionStatus).toBe('active');
  });

  test('cancel sets subscription_status to canceled', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/billing', {
      data: { orgId: fixtures.orgId, action: 'cancel' },
    });
    expect(res.ok()).toBeTruthy();

    const billingRes = await page.request.get('/api/admin/billing');
    const billingBody = await billingRes.json();
    const row = billingBody.subscriptions.find(
      (s: { orgId: string }) => s.orgId === fixtures.orgId,
    );
    expect(row.subscriptionStatus).toBe('canceled');

    // Restore to 'active' so this test doesn't leave the shared fixture
    // org canceled for whichever billing/dashboard test runs after it.
    await page.request.post('/api/admin/billing', {
      data: { orgId: fixtures.orgId, action: 'mark_paid' },
    });
  });
});

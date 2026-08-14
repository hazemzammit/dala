import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3 intro — RBAC enforcement. This is the test the audit called
 * out as missing entirely: before this remediation phase, role was
 * checked in exactly one route (api/admin/admins). Asserts the
 * server-enforced 403s directly via the API, same principle
 * impersonation.spec.ts's nesting-forbidden test already uses — a
 * client-hidden-button assertion is a nice-to-have on top, never a
 * substitute for proving the route handler itself refuses the request.
 */
test.describe('RBAC — role enforcement', () => {
  test('support admin gets 403 on org soft_delete', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post(`/api/admin/organizations/${fixtures.orgId}`, {
      data: { action: 'soft_delete', confirmName: fixtures.orgName },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on org suspend', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post(`/api/admin/organizations/${fixtures.orgId}`, {
      data: { action: 'suspend', reason: 'rbac test' },
    });
    expect(res.status()).toBe(403);
  });

  test('admin (non-super) gets 403 on org soft_delete — super_admin-only', async ({ page }) => {
    const fixtures = loadFixtures();
    // adminA/adminB are seeded with role 'admin', not 'super_admin'.
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post(`/api/admin/organizations/${fixtures.orgId}`, {
      data: { action: 'soft_delete', confirmName: fixtures.orgName },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on db-explorer execute', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/db-explorer/execute', {
      data: { sql: "delete from organizations where id = '00000000-0000-0000-0000-000000000000'" },
    });
    expect(res.status()).toBe(403);
  });

  test('admin (non-super) gets 403 on db-explorer execute — super_admin-only', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/db-explorer/execute', {
      data: { sql: "delete from organizations where id = '00000000-0000-0000-0000-000000000000'" },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on db-explorer approval decision', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    // Any request id works here — the role check runs before the request
    // is even looked up, so a nonexistent id still proves the 403 comes
    // from the role gate, not a 404 from a missing row.
    const res = await page.request.post(
      '/api/admin/db-explorer/approvals/00000000-0000-0000-0000-000000000000',
      { data: { decision: 'approve' } },
    );
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on user suspend', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post(`/api/admin/users/${fixtures.targetUserId}`, {
      data: { action: 'suspend' },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin CAN reset a user password — explicitly allowed', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post(`/api/admin/users/${fixtures.targetUserId}`, {
      data: { action: 'reset_password' },
    });
    // Doc 04 §4.3 intro — "Support ... password resets" is explicitly
    // allowed, so this must NOT 403 (a 400/500 for an unrelated reason is
    // out of scope for this assertion — only proving the role gate itself
    // doesn't block it).
    expect(res.status()).not.toBe(403);
  });

  test('support admin gets 403 on announcement publish', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/announcements', {
      data: { message: 'RBAC test announcement', audience: 'all' },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on billing mark_paid', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/billing', {
      data: { orgId: fixtures.orgId, action: 'mark_paid' },
    });
    expect(res.status()).toBe(403);
  });

  test('support admin gets 403 on storage orphaned-file cleanup', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/storage/cleanup', { data: {} });
    expect(res.status()).toBe(403);
  });

  test("support admin's UI hides destructive buttons — defense in depth, not the real gate", async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    await page.goto('/organizations');
    const orgRow = page.getByRole('row', { name: new RegExp(fixtures.orgName) });
    await expect(orgRow.getByRole('button', { name: 'Suspendre' })).not.toBeVisible();
    await expect(orgRow.getByRole('button', { name: 'Supprimer' })).not.toBeVisible();
  });
});

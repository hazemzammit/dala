import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.9 — Admin Users (managing platform_admins itself). This
 * route (api/admin/admins) was the one route that already had a role
 * gate before this remediation phase — this spec didn't exist yet
 * though, so this closes that coverage gap for the pre-existing gate too.
 */
test.describe('Admin Users', () => {
  test('non-super-admin gets 403 inviting a new admin', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA); // seeded role: 'admin'

    const res = await page.request.post('/api/admin/admins', {
      data: {
        email: 'rbac-spec-should-not-exist@dala.tn',
        fullName: 'Should Not Be Created',
        role: 'support',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('support gets 403 inviting a new admin', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/admins', {
      data: {
        email: 'rbac-spec-should-not-exist-2@dala.tn',
        fullName: 'Should Not Be Created',
        role: 'support',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('admin-users list is reachable by every role (read-only)', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/admins');
      expect(res.ok()).toBeTruthy();
    }
  });
});

/**
 * Admin remediation Tier 1.2 — locked-out admin TOTP re-provisioning
 * (Doc 04 §4.3.1 edge case / §4.3.11). Uses the dedicated adminResetTarget
 * fixture (not adminA/adminSupport) so this test's de-enrollment doesn't
 * leave a shared login fixture broken for other spec files.
 */
test.describe('Admin Users — TOTP reset', () => {
  test('super_admin can reset another admin\u2019s TOTP; they show as not configured', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSuper);
    await page.goto('/admin-users');

    const row = page.getByRole('row', { name: new RegExp(fixtures.adminResetTarget.email) });
    await row.getByRole('button', { name: 'R\u00e9initialiser 2FA' }).click();

    const confirmButton = page
      .getByRole('button', { name: 'R\u00e9initialiser', exact: true })
      .last();
    await expect(confirmButton).toBeDisabled();

    await page.getByLabel(new RegExp('Tapez')).fill(fixtures.adminResetTarget.email);
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(row.getByText('Non configur\u00e9e')).toBeVisible();
  });

  test('reset button is not shown for the acting admin\u2019s own row', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSuper);
    await page.goto('/admin-users');

    const ownRow = page.getByRole('row', { name: new RegExp(fixtures.adminSuper.email) });
    await expect(ownRow.getByRole('button', { name: 'R\u00e9initialiser 2FA' })).toHaveCount(0);
  });

  test('admin (non-super) gets 403 resetting another admin\u2019s TOTP', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post(`/api/admin/admins/${fixtures.adminResetTarget.id}`, {
      data: { action: 'reset_totp' },
    });
    expect(res.status()).toBe(403);
  });
});

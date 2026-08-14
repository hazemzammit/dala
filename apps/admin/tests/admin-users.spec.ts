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

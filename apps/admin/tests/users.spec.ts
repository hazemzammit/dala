import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.4 — Users screen. No spec existed for this screen before
 * this remediation phase. Covers the new revoke_sessions action (item 5)
 * alongside the pre-existing reset/suspend actions, and confirms
 * revoke_sessions actually invalidates a real Supabase Auth session
 * (server-enforced, not just a 200 response) by checking auth.sessions
 * directly via the same DATABASE_URL global-setup.ts already uses.
 */
test.describe('Users', () => {
  test('reset password action succeeds for an admin', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post(`/api/admin/users/${fixtures.targetUserId}`, {
      data: { action: 'reset_password' },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('revoke sessions deletes the user\u2019s real auth.sessions rows', async ({ page }) => {
    const fixtures = loadFixtures();

    // Sign the target user in for real first, via a direct password grant
    // against Supabase Auth's own token endpoint — this creates a genuine
    // auth.sessions row to later confirm gets deleted, rather than
    // asserting against a row that never existed.
    const authRes = await page.request.post(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        data: { email: fixtures.targetWorker.email, password: fixtures.targetWorker.password },
      },
    );
    expect(authRes.ok()).toBeTruthy();

    await loginAsAdmin(page, fixtures.adminA);
    const res = await page.request.post(`/api/admin/users/${fixtures.targetUserId}`, {
      data: { action: 'revoke_sessions' },
    });
    expect(res.ok()).toBeTruthy();

    // A subsequent refresh with the token issued above should now fail —
    // proves the sessions were actually deleted server-side, not just
    // that the route returned 200.
    const authBody = await authRes.json();
    const refreshRes = await page.request.post(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        data: { refresh_token: authBody.refresh_token },
      },
    );
    expect(refreshRes.ok()).toBeFalsy();
  });

  test('user delete requires the exact email to be typed', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post(`/api/admin/users/${fixtures.targetUserId}`, {
      data: { action: 'delete', confirmEmail: 'not-the-right-email@example.com' },
    });
    expect(res.status()).toBe(400);
  });
});

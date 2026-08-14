import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.8 — Storage Monitor. No spec existed for this screen before
 * this remediation phase, including for the orphaned-file cleanup action
 * (cleanup_orphaned_files() — migration 0051 — didn't exist at all
 * before this phase, see that migration's header).
 */
test.describe('Storage Monitor', () => {
  test('GET returns real per-org usage rows', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/storage');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.totals).toHaveProperty('totalBytes');
  });

  test('support gets 403 on orphaned-file cleanup — server-enforced', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/storage/cleanup', { data: {} });
    expect(res.status()).toBe(403);
  });

  test('admin can trigger orphaned-file cleanup and gets a real deleted count', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/storage/cleanup', { data: {} });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.deletedCount).toBe('number');
    expect(typeof body.freedBytes).toBe('number');
  });
});

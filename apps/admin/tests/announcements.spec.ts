import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.10 — Announcements. No spec existed for this screen before
 * this remediation phase.
 */
test.describe('Announcements', () => {
  test('support gets 403 publishing an announcement — server-enforced', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/announcements', {
      data: {
        message: 'announcements.spec.ts probe',
        channels: ['in_app'],
        targetType: 'all_users',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('admin can publish an immediate announcement', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/announcements', {
      data: {
        message: 'announcements.spec.ts — immediate publish',
        channels: ['in_app'],
        targetType: 'all_users',
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('admin can schedule a future announcement', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await page.request.post('/api/admin/announcements', {
      data: {
        message: 'announcements.spec.ts — scheduled',
        channels: ['in_app'],
        targetType: 'all_users',
        scheduledFor,
      },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('audience estimate (GET, read-only) is reachable by support', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.get('/api/admin/announcements?estimate=1&targetType=all_users');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.count).toBe('number');
  });
});

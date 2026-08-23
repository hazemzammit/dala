import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

  test('admin can publish an announcement with the email channel', async ({ page }) => {
    // Admin remediation Tier 2.2 — 'email' was already a valid `channels`
    // array value before this phase (0022); what changed is whether
    // send-announcement-notifications actually does anything with it.
    // This only confirms the admin-authoring path still accepts it, same
    // shape as the in_app test above.
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/announcements', {
      data: {
        message: 'announcements.spec.ts — email channel',
        channels: ['email'],
        targetType: 'all_users',
      },
    });
    expect(res.ok()).toBeTruthy();
  });
});

/**
 * Admin remediation Tier 2.2 — announcement_deliveries.channel widened to
 * allow 'email' (migration 0058). Verifies the schema change directly via
 * the service-role client rather than actually triggering
 * send-announcement-notifications (a cron-invoked Deno Edge Function) —
 * same limitation this suite already discloses elsewhere (see
 * services-health.spec.ts's invocation-log tests) for why Playwright
 * can't invoke it here.
 */
test.describe('Announcements — email delivery logging', () => {
  test('announcement_deliveries accepts channel=email', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const res = await page.request.post('/api/admin/announcements', {
      data: {
        message: 'announcements.spec.ts — email delivery row probe',
        channels: ['email'],
        targetType: 'all_users',
      },
    });
    expect(res.ok()).toBeTruthy();
    const { announcement } = await res.json();

    try {
      const { error: insertError } = await supabase.from('announcement_deliveries').insert({
        announcement_id: announcement.id,
        user_id: fixtures.targetUserId,
        channel: 'email',
        status: 'sent',
      });
      expect(insertError).toBeNull();
    } finally {
      await supabase
        .from('announcement_deliveries')
        .delete()
        .eq('announcement_id', announcement.id);
    }
  });
});

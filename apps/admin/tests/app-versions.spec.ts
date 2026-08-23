import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 01 §1.8.2 — App version / forced-update, admin remediation Tier 2.5.
 * Restores app_versions to its known ('1.0.0', '1.0.0') seed values
 * (0011) after every test that mutates it — this table has exactly two
 * rows, shared across the whole suite (not a per-test fixture), so a
 * test-left mutation here would silently affect any other test that
 * happens to run afterward and calls app_version_check() or reads this
 * screen.
 */
test.describe('App versions', () => {
  test('GET is reachable by every role, including Support', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/app-versions');
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.versions).toHaveLength(2);
    }
  });

  test('admin can update android min_supported_version; audit log records before/after', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    await loginAsAdmin(page, fixtures.adminA);

    try {
      const res = await page.request.post('/api/admin/app-versions', {
        data: { platform: 'android', latestVersion: '9.9.9', minSupportedVersion: '9.9.8' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.version.latest_version).toBe('9.9.9');
      expect(body.version.min_supported_version).toBe('9.9.8');

      // app_version_check() (0011) is the actual enforcement point mobile
      // hits on cold start — confirm the update is really visible there,
      // not just echoed back by the POST response.
      const { data: checkResult } = await supabase.rpc('app_version_check', {
        p_platform: 'android',
        p_build: '9.9.7',
      });
      expect(checkResult.force_update).toBe(true);

      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('action, target_table, metadata')
        .eq('actor_id', fixtures.adminA.id)
        .eq('action', 'app_version.update')
        .gte('created_at', since);
      expect(auditRows?.length).toBeGreaterThanOrEqual(1);
      expect(auditRows?.[0].metadata?.platform).toBe('android');
      expect(auditRows?.[0].metadata?.after?.min_supported_version).toBe('9.9.8');
    } finally {
      await supabase
        .from('app_versions')
        .update({ latest_version: '1.0.0', min_supported_version: '1.0.0' })
        .eq('platform', 'android');
    }
  });

  test('support (read-only) gets 403 attempting an update', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/app-versions', {
      data: { platform: 'ios', latestVersion: '9.9.9', minSupportedVersion: '9.9.9' },
    });
    expect(res.status()).toBe(403);
  });

  test('missing fields are rejected with 400', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/app-versions', {
      data: { platform: 'ios', latestVersion: '' },
    });
    expect(res.status()).toBe(400);
  });
});

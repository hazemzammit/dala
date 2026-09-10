import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.10 — feature flags / gradual rollout.
 * Per-org boolean flags only (see migration 0068's header for the scope
 * decision). Covers the full lifecycle: create, toggle default, per-org
 * override (set + clear), delete (cascades overrides), role gating, and
 * get_feature_flag()'s precedence rule directly at the SQL layer — that
 * function is the actual thing mobile/web app code would call once a
 * real feature needs to gate on this, so it's worth testing on its own,
 * not just through the admin CRUD surface.
 */
test.describe('Feature flags — CRUD', () => {
  async function cleanupFlag(supabase: SupabaseClient<any, any, any>, key: string) {
    await supabase.from('feature_flags').delete().eq('key', key);
  }

  test('create, toggle default, delete a flag', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const key = `e2e_test_flag_${Date.now()}`;

    await loginAsAdmin(page, fixtures.adminA);

    try {
      const createRes = await page.request.post('/api/admin/feature-flags', {
        data: { key, description: 'e2e test flag', defaultEnabled: false },
      });
      expect(createRes.ok()).toBeTruthy();

      const listRes = await page.request.get('/api/admin/feature-flags');
      const { flags } = await listRes.json();
      expect(flags.some((f: { key: string }) => f.key === key)).toBe(true);

      const patchRes = await page.request.patch(`/api/admin/feature-flags/${key}`, {
        data: { defaultEnabled: true },
      });
      expect(patchRes.ok()).toBeTruthy();

      const { data: after } = await supabase
        .from('feature_flags')
        .select('default_enabled')
        .eq('key', key)
        .single();
      expect(after?.default_enabled).toBe(true);
    } finally {
      await cleanupFlag(supabase, key);
    }
  });

  test('rejects a non-snake_case key', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/feature-flags', {
      data: { key: 'Not Snake Case!', description: 'x', defaultEnabled: false },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a duplicate key with 409', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const key = `e2e_test_dup_${Date.now()}`;
    await loginAsAdmin(page, fixtures.adminA);

    try {
      await page.request.post('/api/admin/feature-flags', {
        data: { key, description: 'first', defaultEnabled: false },
      });
      const dupRes = await page.request.post('/api/admin/feature-flags', {
        data: { key, description: 'second', defaultEnabled: false },
      });
      expect(dupRes.status()).toBe(409);
    } finally {
      await cleanupFlag(supabase, key);
    }
  });

  test('support gets 403 creating a flag but can read the list', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const createRes = await page.request.post('/api/admin/feature-flags', {
      data: { key: 'e2e_should_not_be_created', description: 'x', defaultEnabled: false },
    });
    expect(createRes.status()).toBe(403);

    const listRes = await page.request.get('/api/admin/feature-flags');
    expect(listRes.ok()).toBeTruthy();
  });

  test('deleting a flag cascades its org overrides', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const key = `e2e_test_cascade_${Date.now()}`;
    await loginAsAdmin(page, fixtures.adminA);

    await page.request.post('/api/admin/feature-flags', {
      data: { key, description: 'cascade test', defaultEnabled: false },
    });
    await page.request.post(`/api/admin/feature-flags/${key}/overrides`, {
      data: { orgId: fixtures.orgId, action: 'set', enabled: true },
    });

    const { data: beforeDelete } = await supabase
      .from('organization_feature_flags')
      .select('org_id')
      .eq('flag_key', key);
    expect(beforeDelete).toHaveLength(1);

    await page.request.delete(`/api/admin/feature-flags/${key}`);

    const { data: afterDelete } = await supabase
      .from('organization_feature_flags')
      .select('org_id')
      .eq('flag_key', key);
    expect(afterDelete).toHaveLength(0);
  });
});

test.describe('Feature flags — per-org override precedence (get_feature_flag)', () => {
  test('org override takes precedence over default; clearing reverts to default', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const key = `e2e_test_precedence_${Date.now()}`;
    await loginAsAdmin(page, fixtures.adminA);

    try {
      await page.request.post('/api/admin/feature-flags', {
        data: { key, description: 'precedence test', defaultEnabled: false },
      });

      const { data: beforeOverride } = await supabase.rpc('get_feature_flag', {
        p_org_id: fixtures.orgId,
        p_key: key,
      });
      expect(beforeOverride).toBe(false);

      await page.request.post(`/api/admin/feature-flags/${key}/overrides`, {
        data: { orgId: fixtures.orgId, action: 'set', enabled: true },
      });

      const { data: withOverride } = await supabase.rpc('get_feature_flag', {
        p_org_id: fixtures.orgId,
        p_key: key,
      });
      expect(withOverride).toBe(true);

      await page.request.post(`/api/admin/feature-flags/${key}/overrides`, {
        data: { orgId: fixtures.orgId, action: 'clear' },
      });

      const { data: afterClear } = await supabase.rpc('get_feature_flag', {
        p_org_id: fixtures.orgId,
        p_key: key,
      });
      expect(afterClear).toBe(false);
    } finally {
      await supabase.from('feature_flags').delete().eq('key', key);
    }
  });

  test('an unknown flag key returns false, not an error', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data, error } = await supabase.rpc('get_feature_flag', {
      p_org_id: fixtures.orgId,
      p_key: 'this_flag_does_not_exist',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  test('get_feature_flag is callable by authenticated (not just service_role)', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    // Signed in as the seeded org owner — a real `authenticated`-role
    // client, not anon and not service_role, matching how mobile/web app
    // code would actually call this once a feature needs it.
    await anonClient.auth.signInWithPassword({
      email: fixtures.orgOwner.email,
      password: fixtures.orgOwner.password,
    });

    const { data, error } = await anonClient.rpc('get_feature_flag', {
      p_org_id: fixtures.orgId,
      p_key: 'any_key',
    });
    expect(error).toBeNull();
    expect(data).toBe(false);
  });
});

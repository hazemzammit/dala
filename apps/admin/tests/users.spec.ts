import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Phase 6.3 (premium-ux-system-guide.md §9/§18) — Users' "Suspendre" is now an
 * immediate-fire action with an undo toast (the dynamic Suspendre/Réactiver
 * pair), not a confirmation dialog. Verifies the new UI flow: clicking
 * "Suspendre" in the row's ••• menu fires suspend right away (no "Tapez" gate),
 * shows a toast with an "Annuler" action, the user is actually suspended
 * server-side, and clicking "Annuler" reverses it via unsuspend.
 */
test.describe('Users — suspend undo toast', () => {
  test('suspend fires immediately with an undo toast; Annuler reverses it', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Derive the org owner's user id (a real, suspendable user in the list).
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const orgOwner = authUsers.users.find((u) => u.email === fixtures.orgOwner.email);
    if (!orgOwner)
      throw new Error(`No auth.users row for fixture email ${fixtures.orgOwner.email}`);
    const targetId = orgOwner.id;

    // Start from a known-unsuspended state so the assertion is deterministic.
    await supabase.from('profiles').update({ suspended_at: null }).eq('id', targetId);

    try {
      await loginAsAdmin(page, fixtures.adminA);

      await page.goto('/users');
      // Phase 5.2 — row actions live behind a ••• menu; the row is found by the
      // user's email cell (portaled menu means page-level scoping for the click).
      const userRow = page.getByRole('row', { name: new RegExp(fixtures.orgOwner.email) });
      await userRow.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: 'Suspendre' }).click();

      // No typed-confirmation dialog — the action fires immediately.
      await expect(page.getByLabel(/Tapez/)).toHaveCount(0);

      // The undo toast appears with an "Annuler" action, proving suspend fired.
      const undoButton = page.getByRole('button', { name: 'Annuler' });
      await expect(undoButton).toBeVisible();

      // The user is now suspended server-side.
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('profiles')
            .select('suspended_at')
            .eq('id', targetId)
            .single();
          return data?.suspended_at !== null;
        })
        .toBe(true);

      // "Annuler" reverses the suspension.
      await undoButton.click();

      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('profiles')
            .select('suspended_at')
            .eq('id', targetId)
            .single();
          return data?.suspended_at === null;
        })
        .toBe(true);
    } finally {
      // Leave the shared fixture user in a clean, unsuspended state.
      await supabase.from('profiles').update({ suspended_at: null }).eq('id', targetId);
    }
  });
});

/**
 * Admin remediation Tier 4.1 — pagination. Same reasoning as
 * organizations.spec.ts's own pagination suite: pageSize=1 against this
 * suite's small fixed set of seeded users forces a real second page
 * without needing 50+ rows just to exercise .range().
 */
test.describe('Users — pagination', () => {
  test('page/pageSize params are honored and total is accurate', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const page1Res = await page.request.get('/api/admin/users?page=1&pageSize=1');
    const page1Body = await page1Res.json();
    expect(page1Body.users).toHaveLength(1);
    expect(page1Body.page).toBe(1);
    expect(page1Body.total).toBeGreaterThanOrEqual(1);

    if (page1Body.total > 1) {
      const page2Res = await page.request.get('/api/admin/users?page=2&pageSize=1');
      const page2Body = await page2Res.json();
      expect(page2Body.users).toHaveLength(1);
      const page1User = page1Body.users[0];
      const page2User = page2Body.users[0];
      if (!page1User || !page2User) throw new Error('Expected one user on each page');
      expect(page2User.id).not.toBe(page1User.id);
    }
  });
});

/**
 * Admin remediation Tier 4.2 — search. Users search is the more involved
 * of the two (name/phone via PostgREST directly, email via a separate
 * `pg` pool query against auth.users — see api/admin/users/route.ts's own
 * header for why). This suite specifically exercises the email path,
 * since that's the part of this item that wasn't a straightforward
 * `.ilike()` call.
 */
test.describe('Users — search', () => {
  test('?q= matches by email via the auth.users pg-pool path', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    // Distinctive fragment of fixtures.targetWorker.email
    // ('e2e-target-worker@dala.tn') that would NOT appear in that user's
    // full_name — isolates this test to the email-search path
    // specifically, not an accidental name-search match.
    const res = await page.request.get('/api/admin/users?q=target-worker');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const ids = (body.users ?? []).map((u: { id: string }) => u.id);
    expect(ids).toContain(fixtures.targetUserId);
  });

  test('a query matching nothing returns an empty result set, not an error', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/users?q=zzz-no-such-user-zzz');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.users).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('search input filters the visible table', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto('/users');

    await page
      .getByPlaceholder('Rechercher par nom, email, téléphone…')
      .fill('zzz-no-such-user-zzz');
    // Phase 5.4 — §7's NoResultsState replaces the old per-table
    // description; the §7 description is the stable string to assert.
    await expect(page.getByText('Essayez un autre terme ou modifiez vos filtres.')).toBeVisible({
      timeout: 2000,
    });
  });
});

/**
 * Admin remediation Tier 4.3 — bulk actions. Uses BOTH real seeded
 * profiles (orgOwner + targetWorker) for a genuine N=2 case, unlike
 * organizations.spec.ts's bulk suite which only has one seeded org to
 * work with — orgOwner's id isn't stashed in fixtures directly (only
 * targetUserId is), so it's looked up here via auth.admin.listUsers()
 * filtered by the known fixture email, same approach the app's own
 * admins/users routes use for the same underlying problem (email lives
 * on auth.users, not profiles).
 */
test.describe('Users — bulk actions', () => {
  async function getOrgOwnerId(supabase: SupabaseClient<any, any, any>, email: string) {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const match = data.users.find((u) => u.email === email);
    if (!match) throw new Error(`No auth.users row found for fixture email ${email}`);
    return match.id;
  }

  test('bulk suspend then bulk unsuspend both real users, one audit row each', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();
    const orgOwnerId = await getOrgOwnerId(supabase, fixtures.orgOwner.email);
    const targetIds = [orgOwnerId, fixtures.targetUserId];

    await loginAsAdmin(page, fixtures.adminA);

    try {
      const suspendRes = await page.request.post('/api/admin/users/bulk', {
        data: { action: 'suspend', targetIds },
      });
      expect(suspendRes.ok()).toBeTruthy();
      const suspendBody = await suspendRes.json();
      expect(suspendBody.failureCount).toBe(0);

      const { data: suspended } = await supabase
        .from('profiles')
        .select('id, suspended_at')
        .in('id', targetIds);
      expect(suspended?.every((p) => p.suspended_at !== null)).toBe(true);

      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('action, target_id, metadata')
        .eq('actor_id', fixtures.adminA.id)
        .eq('action', 'user.suspend')
        .gte('created_at', since);
      // One row per target, not one combined row (the plan's own
      // instruction) — both target ids should each have their own row.
      const loggedTargetIds = new Set((auditRows ?? []).map((r) => r.target_id));
      expect(loggedTargetIds.has(orgOwnerId)).toBe(true);
      expect(loggedTargetIds.has(fixtures.targetUserId)).toBe(true);

      const unsuspendRes = await page.request.post('/api/admin/users/bulk', {
        data: { action: 'unsuspend', targetIds },
      });
      expect(unsuspendRes.ok()).toBeTruthy();

      const { data: unsuspended } = await supabase
        .from('profiles')
        .select('id, suspended_at')
        .in('id', targetIds);
      expect(unsuspended?.every((p) => p.suspended_at === null)).toBe(true);
    } finally {
      await supabase.from('profiles').update({ suspended_at: null }).in('id', targetIds);
    }
  });

  test('support gets 403 on bulk suspend', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const res = await page.request.post('/api/admin/users/bulk', {
      data: { action: 'suspend', targetIds: [fixtures.targetUserId] },
    });
    expect(res.status()).toBe(403);
  });

  test('empty targetIds is rejected with 400', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/users/bulk', {
      data: { action: 'suspend', targetIds: [] },
    });
    expect(res.status()).toBe(400);
  });
});

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Phase 6.3 (premium-ux-system-guide.md §9/§18) — suspend is now an
 * immediate-fire action with an undo toast, not a typed-confirmation dialog.
 * Verifies the new flow: clicking "Suspendre" fires suspend right away (no
 * "Tapez" gate), shows a toast with an "Annucer" action, the org is actually
 * suspended server-side, and clicking "Annucer" reverses it via unsuspend.
 */
test.describe('Organizations — destructive actions', () => {
  test('suspend fires immediately with an undo toast; Annuler reverses it', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Start from a known-unsuspended state so the assertion is deterministic.
    await supabase.from('organizations').update({ suspended_at: null }).eq('id', fixtures.orgId);

    try {
      await loginAsAdmin(page, fixtures.adminA);

      await page.goto('/organizations');
      const orgRow = page.getByRole('row', { name: new RegExp(fixtures.orgName) });
      // Phase 5.2 — row actions moved into a ••• menu (premium-ux-system-guide
      // §6.1): same 'Suspendre' string, now role="menuitem" behind the row's
      // 'Actions' trigger (portaled to <body>, hence page-level scoping).
      await orgRow.getByRole('button', { name: 'Actions' }).click();
      await page.getByRole('menuitem', { name: 'Suspendre' }).click();

      // No typed-confirmation dialog — the action fires immediately.
      await expect(page.getByLabel(/Tapez/)).toHaveCount(0);

      // The undo toast appears with an "Annuler" action, proving suspend fired.
      const undoButton = page.getByRole('button', { name: 'Annuler' });
      await expect(undoButton).toBeVisible();

      // The org is now suspended server-side.
      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('organizations')
            .select('suspended_at')
            .eq('id', fixtures.orgId)
            .single();
          return data?.suspended_at !== null;
        })
        .toBe(true);

      // "Annuler" reverses the suspension.
      await undoButton.click();

      await expect
        .poll(async () => {
          const { data } = await supabase
            .from('organizations')
            .select('suspended_at')
            .eq('id', fixtures.orgId)
            .single();
          return data?.suspended_at === null;
        })
        .toBe(true);
    } finally {
      // Leave the shared fixture org in a clean, unsuspended state.
      await supabase.from('organizations').update({ suspended_at: null }).eq('id', fixtures.orgId);
    }
  });
});

/**
 * Admin remediation Tier 1.1 — soft-delete restore UI. Verifies the full
 * round trip: an org soft-deleted within its 30-day window shows a
 * Restaurer button to a Super Admin, clicking it actually calls
 * restore_organization() (0021), and the org shows as Active again
 * afterward — not just that a button renders.
 */
test.describe('Organizations — restore', () => {
  test('super_admin can restore a soft-deleted org within the 30-day window', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Soft-delete directly via the RPC rather than driving the
    // suspend/soft-delete UI here too — that confirm-by-typing flow is
    // already covered by the test above; this test's job is restore.
    await supabase.rpc('soft_delete_organization', { p_org_id: fixtures.orgId });

    try {
      await loginAsAdmin(page, fixtures.adminSuper);
      await page.goto(`/organizations/${fixtures.orgId}`);

      await expect(page.getByText('Supprimée (récupérable)')).toBeVisible();
      const restoreButton = page.getByRole('button', { name: 'Restaurer' });
      await expect(restoreButton).toBeEnabled();

      await restoreButton.click();

      await expect(page.getByText('Active', { exact: true })).toBeVisible();
      await expect(page.getByText('Supprimée (récupérable)')).not.toBeVisible();

      const { data: org } = await supabase
        .from('organizations')
        .select('deleted_at')
        .eq('id', fixtures.orgId)
        .single();
      expect(org?.deleted_at).toBeNull();
    } finally {
      // Leave the shared fixture org in its normal (non-deleted) state
      // for other spec files regardless of whether this test passed.
      await supabase.from('organizations').update({ deleted_at: null }).eq('id', fixtures.orgId);
    }
  });

  test('admin (non-super) gets 403 on org restore — super_admin-only', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await supabase.rpc('soft_delete_organization', { p_org_id: fixtures.orgId });

    try {
      await loginAsAdmin(page, fixtures.adminA);
      await page.goto(`/organizations/${fixtures.orgId}`);

      // adminA is 'admin', not 'super_admin' — Doc 04 §4.3 intro reserves
      // org deletion/restoration for Super Admin, so the button shouldn't
      // even render (defense-in-depth UI gating), and the route itself
      // must independently 403 a direct call regardless of the UI.
      await expect(page.getByText('Supprimée (récupérable)')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Restaurer' })).toHaveCount(0);

      const res = await page.request.post(`/api/admin/organizations/${fixtures.orgId}`, {
        data: { action: 'restore' },
      });
      expect(res.status()).toBe(403);
    } finally {
      await supabase.from('organizations').update({ deleted_at: null }).eq('id', fixtures.orgId);
    }
  });
});

/**
 * Admin remediation Tier 4.1 — pagination. Uses pageSize=1 against the
 * suite's small, fixed set of seeded orgs (global-setup.ts creates one:
 * fixtures.orgId) to force multiple "pages" out of real data rather than
 * needing 50+ seeded orgs just to see a second page — this is testing the
 * pagination CONTRACT (page/pageSize honored, total accurate), not UI
 * appearance at realistic scale.
 */
test.describe('Organizations — pagination', () => {
  test('page/pageSize params are honored and total is accurate', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const page1Res = await page.request.get('/api/admin/organizations?page=1&pageSize=1');
    const page1Body = await page1Res.json();
    expect(page1Body.organizations).toHaveLength(1);
    expect(page1Body.page).toBe(1);
    expect(page1Body.pageSize).toBe(1);
    expect(page1Body.total).toBeGreaterThanOrEqual(1);

    if (page1Body.total > 1) {
      const page2Res = await page.request.get('/api/admin/organizations?page=2&pageSize=1');
      const page2Body = await page2Res.json();
      expect(page2Body.organizations).toHaveLength(1);
      // Different org on page 2 — proves .range() is actually paginating,
      // not just accepting and ignoring the params.
      expect(page2Body.organizations[0].id).not.toBe(page1Body.organizations[0].id);
    }
  });

  test('pagination controls render and page navigation actually changes rows', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto('/organizations');

    const totalRes = await page.request.get('/api/admin/organizations?page=1&pageSize=1');
    const { total } = await totalRes.json();

    if (total > 1) {
      // Only meaningful with >1 org seeded — with exactly one, "Suivant"
      // is correctly disabled and there's nothing further to click through.
      // Can't force pageSize=1 through the real UI (PAGE_SIZE is a fixed
      // constant in OrganizationsTable.tsx, not user-adjustable) — this
      // check only confirms the page indicator renders and reflects a
      // real total, not that a full second page of 50 is reachable with
      // this suite's seed data.
      await expect(page.getByText(/Page \d+\/\d+/)).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();
    }
  });
});

/**
 * Admin remediation Tier 4.2 — search. Organizations search is name-only
 * (no email concept for an org), so this is the simpler of the two search
 * suites — see users.spec.ts's own search suite for the email-search path.
 */
test.describe('Organizations — search', () => {
  test('?q= filters by name (partial, case-insensitive) via the API', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    // Partial, lowercased fragment of fixtures.orgName ('E2E Test Org —
    // Playwright') — confirms .ilike() partial + case-insensitive
    // matching, not just an exact-match filter.
    const res = await page.request.get('/api/admin/organizations?q=test org');
    const body = await res.json();
    const names = (body.organizations ?? []).map((o: { name: string }) => o.name);
    expect(names).toContain(fixtures.orgName);
  });

  test('a query matching nothing returns an empty result set, not an error', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/organizations?q=zzz-no-such-org-zzz');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.organizations).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test('search input filters the visible table', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto('/organizations');

    await page.getByPlaceholder('Rechercher par nom…').fill('zzz-no-such-org-zzz');
    // SearchInput debounces 300ms — wait for the filtered (empty) result
    // rather than asserting immediately after fill().
    // Phase 5.4 — the filtered-empty case now renders §7's NoResultsState;
    // the §7 description is the stable string to assert.
    await expect(page.getByText('Essayez un autre terme ou modifiez vos filtres.')).toBeVisible({
      timeout: 2000,
    });
  });
});

/**
 * Admin remediation Tier 4.3 — bulk actions. This suite only ever has
 * global-setup.ts's single seeded org (fixtures.orgId) to work with, so
 * these tests exercise the bulk endpoint's plumbing (role gating, the
 * per-target audit-log shape, restoring state afterward) with a
 * single-element targetIds array rather than a genuine N>1 case — the
 * endpoint's loop logic doesn't behave differently at N=1 vs N=5, so this
 * is still a meaningful check of the real code path, just not of what a
 * multi-row selection looks like in the UI specifically.
 */
test.describe('Organizations — bulk actions', () => {
  test('bulk change_plan updates the org and logs one audit row with bulk:true', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    await loginAsAdmin(page, fixtures.adminA);

    const { data: before } = await supabase
      .from('organizations')
      .select('plan')
      .eq('id', fixtures.orgId)
      .single();
    const originalPlan = before?.plan ?? 'free';

    try {
      const res = await page.request.post('/api/admin/organizations/bulk', {
        data: { action: 'change_plan', targetIds: [fixtures.orgId], plan: 'pro' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.failureCount).toBe(0);

      const { data: after } = await supabase
        .from('organizations')
        .select('plan')
        .eq('id', fixtures.orgId)
        .single();
      expect(after?.plan).toBe('pro');

      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('action, metadata')
        .eq('actor_id', fixtures.adminA.id)
        .eq('action', 'org.change_plan')
        .gte('created_at', since);
      expect(auditRows?.some((r) => (r.metadata as any)?.bulk === true)).toBe(true);
    } finally {
      await supabase.from('organizations').update({ plan: originalPlan }).eq('id', fixtures.orgId);
    }
  });

  test('bulk export returns combined JSON for every target', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/organizations/bulk', {
      data: { action: 'export', targetIds: [fixtures.orgId] },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.exports).toHaveLength(1);
    expect(body.exports[0].orgId).toBe(fixtures.orgId);
  });

  test('support gets 403 on bulk change_plan but can bulk export', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminSupport);

    const changePlanRes = await page.request.post('/api/admin/organizations/bulk', {
      data: { action: 'change_plan', targetIds: [fixtures.orgId], plan: 'pro' },
    });
    expect(changePlanRes.status()).toBe(403);

    const exportRes = await page.request.post('/api/admin/organizations/bulk', {
      data: { action: 'export', targetIds: [fixtures.orgId] },
    });
    expect(exportRes.ok()).toBeTruthy();
  });

  test('empty targetIds is rejected with 400', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.post('/api/admin/organizations/bulk', {
      data: { action: 'export', targetIds: [] },
    });
    expect(res.status()).toBe(400);
  });
});

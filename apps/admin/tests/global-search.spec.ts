import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Admin remediation Tier 4.4 — global cross-entity search. Covers the
 * `api/admin/search` route directly (all three categories, the short-
 * query gate, read-access for every role) plus one UI test driving the
 * actual ⌘K palette end-to-end.
 */
test.describe('Global search — API', () => {
  test('a query under 2 characters returns empty results for all three categories', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/search?q=a');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.organizations).toHaveLength(0);
    expect(body.users).toHaveLength(0);
    expect(body.auditLogEntries).toHaveLength(0);
  });

  test('matches an organization by name', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/search?q=test org');
    const body = await res.json();
    const names = (body.organizations ?? []).map((o: { name: string }) => o.name);
    expect(names).toContain(fixtures.orgName);
  });

  test('matches a user by email (via the same auth.users pg-pool path as Tier 4.2)', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const res = await page.request.get('/api/admin/search?q=target-worker');
    const body = await res.json();
    const ids = (body.users ?? []).map((u: { id: string }) => u.id);
    expect(ids).toContain(fixtures.targetUserId);
  });

  test('matches recent audit_log actions', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    // adminA's own login just wrote an admin.login row (Tier 2.3) —
    // reliably present without needing to seed anything extra for this
    // test specifically.
    const res = await page.request.get('/api/admin/search?q=admin.login');
    const body = await res.json();
    const actions = (body.auditLogEntries ?? []).map((e: { action: string }) => e.action);
    expect(actions).toContain('admin.login');
  });

  test('reachable by every role, including support (read-only)', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      const res = await page.request.get('/api/admin/search?q=test');
      expect(res.ok()).toBeTruthy();
    }
  });
});

test.describe('Global search — UI', () => {
  test('⌘K opens the palette, typing shows results, clicking navigates', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto('/dashboard');

    await page.keyboard.press('Meta+k');
    // Fall back to Control+k — CI runners are typically Linux, where
    // Playwright's 'Meta' key mapping isn't always reliable across
    // browser channels; pressing both covers either environment without
    // needing to detect the OS first.
    const input = page.getByPlaceholder('Rechercher une organisation, un utilisateur, une action…');
    if (!(await input.isVisible().catch(() => false))) {
      await page.keyboard.press('Control+k');
    }
    await expect(input).toBeVisible();

    await input.fill('test org');
    await expect(page.getByText(fixtures.orgName)).toBeVisible({ timeout: 2000 });

    await page.getByText(fixtures.orgName).click();
    await expect(page).toHaveURL(new RegExp(`/organizations/${fixtures.orgId}$`));
  });

  test('Escape closes the palette', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Rechercher' }).click();
    const input = page.getByPlaceholder('Rechercher une organisation, un utilisateur, une action…');
    await expect(input).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(input).not.toBeVisible();
  });
});

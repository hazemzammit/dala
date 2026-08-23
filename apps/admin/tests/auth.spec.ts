import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.1 / Doc 01 §1.3.10 — two-step login (email+password, then
 * TOTP), generic errors on every failure path.
 *
 * NOTE on the IP-allowlist gate: it's read from ADMIN_IP_ALLOWLIST at
 * request time by middleware.ts, but the dev server is already running
 * (via playwright.config.ts's webServer) with whatever value was in
 * .env.local when it started — this suite can't toggle it mid-run. Run
 * this file twice in CI if you want full coverage: once normally (gate
 * effectively disabled for localhost, as recommended for local/CI
 * testing), and once with ADMIN_IP_ALLOWLIST set to a deliberately
 * non-matching value to confirm /access-denied actually renders and
 * blocks the login form.
 */
test.describe('Admin auth', () => {
  test('access-denied page renders standalone (no login form reachable from it)', async ({
    page,
  }) => {
    await page.goto('/access-denied');
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveCount(0);
  });

  test('wrong password gives a generic error, not "wrong password" specifically', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@dala.tn');
    await page.getByLabel('Mot de passe').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByText('Identifiants invalides.')).toBeVisible();
    // Still on /login — never routed to /totp for a non-existent/wrong account.
    await expect(page).toHaveURL(/\/login$/);
  });

  test('full two-step login succeeds with valid credentials + TOTP code', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Métriques' })).toBeVisible();
  });

  test('wrong TOTP code is rejected without ending the challenge', async ({ page }) => {
    const fixtures = loadFixtures();
    await page.goto('/login');
    await page.getByLabel('Email').fill(fixtures.adminA.email);
    await page.getByLabel('Mot de passe').fill(fixtures.adminA.password);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.waitForURL('**/totp');

    await page.getByLabel('Code à 6 chiffres').fill('000000');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('Code invalide.')).toBeVisible();
    await expect(page).toHaveURL(/\/totp$/);
  });

  test('logout revokes the session — back button cannot re-enter the admin area', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});

/**
 * Admin remediation Tier 2.3 — closes the gap 0053's own header flagged:
 * login/logout previously never wrote an audit_log row, so the 1-year
 * security-event retention tier had nothing to retain for either. Reads
 * audit_log directly via the service-role client rather than the admin
 * UI (AuditLogTable needed no changes — its filters already work
 * generically off the `action` column, per the plan).
 */
test.describe('Admin auth — audit log', () => {
  test('login writes an admin.login row; logout writes an admin.logout row', async ({ page }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const since = new Date().toISOString();

    await loginAsAdmin(page, fixtures.adminB);

    const { data: loginRows } = await supabase
      .from('audit_log')
      .select('id, action, actor_id, target_id')
      .eq('actor_id', fixtures.adminB.id)
      .eq('action', 'admin.login')
      .gte('created_at', since);
    expect(loginRows?.length).toBeGreaterThanOrEqual(1);
    expect(loginRows?.[0].target_id).toBe(fixtures.adminB.id);

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/login$/);

    const { data: logoutRows } = await supabase
      .from('audit_log')
      .select('id, action, actor_id')
      .eq('actor_id', fixtures.adminB.id)
      .eq('action', 'admin.logout')
      .gte('created_at', since);
    expect(logoutRows?.length).toBeGreaterThanOrEqual(1);
  });
});

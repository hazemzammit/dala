import { test, expect } from '@playwright/test';

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

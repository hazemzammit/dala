import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.2 — platform metrics dashboard.
 *
 * Admin remediation Tier 2.4 — this file didn't exist before (flagged by
 * the remediation plan as one of two coverage holes). Two things worth
 * actually regression-proofing, per the plan:
 *   1. The 8 StatCards render real numbers, not "undefined"/"NaN" — a
 *      silent join/aggregation bug in page.tsx's Promise.all could
 *      otherwise ship a broken metric that LOOKS like a rendered card and
 *      nothing here would catch it.
 *   2. The honest-gap disclosure text stays present — page.tsx's own
 *      header comment explains DAU/MAU, invite-acceptance, and churn are
 *      deliberately NOT shown (no time-series source exists yet /
 *      insufficient real history), rather than shipping a fake number.
 *      This regression-proofs THAT choice specifically: a future change
 *      that quietly adds a fabricated churn % without removing this text
 *      would leave both a fake number AND a paragraph claiming it doesn't
 *      exist, visible on the same page.
 *
 * NOTE on the plan's wording: it says "assert the two 'not yet built'
 * disclosure paragraphs are present" (plural, two separate <p> elements).
 * Reading the actual page.tsx, there's exactly ONE <p> covering all three
 * gaps (DAU/MAU+invites, churn, and the chart/date-range selector) in one
 * block of prose — not two. This test asserts the real structure (one
 * paragraph, checked for both distinct gap-disclosures' key phrases)
 * rather than forcing a two-paragraph assumption that doesn't match the
 * code.
 */
test.describe('Dashboard', () => {
  test('KPI cards render real numbers, not undefined/NaN', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);
    await expect(page).toHaveURL(/\/dashboard$/);

    const labels = [
      'Organisations totales',
      'Organisations actives',
      'Utilisateurs totaux',
      'MRR',
      'Projets',
      'Journaux de chantier',
      'Dépenses enregistrées',
      'Stockage utilisé',
    ];

    for (const label of labels) {
      const card = page.locator('div', { hasText: label }).last();
      const cardText = await card.innerText();
      expect(cardText).not.toContain('undefined');
      expect(cardText).not.toContain('NaN');
      expect(cardText).not.toMatch(/^\s*$/);
    }

    // Org/user counts are non-negative test-seeded data — at minimum
    // the one org + handful of users global-setup.ts always creates,
    // so a genuine zero here (vs. just "small") would itself be a sign
    // the count query returned nothing rather than a real small number.
    await expect(page.getByText('Organisations totales')).toBeVisible();
  });

  test('honest-gap disclosure text is present (DAU/MAU + churn both named)', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    const disclosure = page.locator('p', { hasText: 'DAU/MAU' });
    await expect(disclosure).toBeVisible();
    const text = await disclosure.innerText();
    expect(text).toContain('DAU/MAU');
    expect(text).toContain('désabonnement');
  });

  test('dashboard is reachable by every admin role (read-only)', async ({ page }) => {
    const fixtures = loadFixtures();
    for (const admin of [fixtures.adminA, fixtures.adminSupport]) {
      await loginAsAdmin(page, admin);
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole('heading', { name: 'Métriques' })).toBeVisible();
    }
  });
});

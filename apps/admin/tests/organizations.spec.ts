import { test, expect } from '@playwright/test';

import { loadFixtures } from './helpers/fixtures';
import { loginAsAdmin } from './helpers/login';

/**
 * Doc 04 §4.3.3 — destructive-action confirm-by-typing gate. Verifies the
 * UI genuinely blocks the action until the exact org name is typed, not
 * just that a dialog appears.
 */
test.describe('Organizations — destructive actions', () => {
  test('suspend button stays disabled until the exact org name is typed', async ({ page }) => {
    const fixtures = loadFixtures();
    await loginAsAdmin(page, fixtures.adminA);

    await page.goto('/organizations');
    const orgRow = page.getByRole('row', { name: new RegExp(fixtures.orgName) });
    await orgRow.getByRole('button', { name: 'Suspendre' }).click();

    const confirmButton = page.getByRole('button', { name: 'Suspendre', exact: true }).last();
    await expect(confirmButton).toBeDisabled();

    // Wrong text — still disabled.
    const confirmInput = page.getByLabel(new RegExp('Tapez'));
    await confirmInput.fill('not the org name');
    await expect(confirmButton).toBeDisabled();

    // A reason is also required (>=10 chars) alongside the exact name.
    await confirmInput.fill(fixtures.orgName);
    await expect(confirmButton).toBeDisabled();

    await page.getByLabel(/Motif/).fill('Test suspension via Playwright e2e suite');
    await expect(confirmButton).toBeEnabled();
  });
});

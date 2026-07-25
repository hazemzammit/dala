/**
 * apps/admin/tests/helpers/login.ts
 *
 * Drives the actual two-step login UI (not a shortcut/mock) — a TOTP code
 * is time-based, so it must be generated fresh at the moment of login, not
 * precomputed in global-setup.ts.
 */
import type { Page } from '@playwright/test';
import * as OTPAuth from 'otpauth';

export function generateTotpCode(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

export async function loginAsAdmin(
  page: Page,
  admin: { email: string; password: string; totpSecret: string },
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Mot de passe').fill(admin.password);
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.waitForURL('**/totp');
  await page.getByLabel('Code à 6 chiffres').fill(generateTotpCode(admin.totpSecret));
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await page.waitForURL('**/dashboard');
}

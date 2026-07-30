import { by, device, element, waitFor } from 'detox';

import { generateTotpCode } from './totp';

/**
 * apps/mobile/e2e/twoFactorAuth.e2e.ts
 *
 * Doc 02 §2.11 explicitly names this flow ("the 2FA enroll → logout →
 * login-with-TOTP flow") as one of the handful of Detox specs the test
 * matrix calls out directly — built this phase for that reason, ahead of
 * the rest of §2.11's broader e2e list (see PHASE_9 delivery notes for
 * what's deliberately left for the next testing phase).
 *
 * Requires a pre-seeded test account with NO 2FA factor enrolled at the
 * start of this spec (the spec enrolls one, then tears it down at the
 * end so the account is clean for the next run). Credentials come from
 * env vars, never hard-coded:
 *
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD
 *
 * This spec does NOT seed that account itself — provisioning a
 * throwaway/reset-able Supabase test user is an environment-setup
 * concern (CI secrets, a seed script), not something an individual e2e
 * spec should own. See the delivery guide's manual test checklist for
 * the one-time setup this test expects.
 */
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

async function login() {
  await waitFor(element(by.id('login-email-input')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('login-email-input')).typeText(EMAIL!);
  await element(by.id('login-password-input')).typeText(PASSWORD!);
  await element(by.id('login-submit-button')).tap();
}

async function openSecuritySettings() {
  await waitFor(element(by.id('bottom-nav-plus')))
    .toBeVisible()
    .withTimeout(15000);
  await element(by.id('bottom-nav-plus')).tap();
  await waitFor(element(by.id('plus-sheet-settings')))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.id('plus-sheet-settings')).tap();
  await waitFor(element(by.id('settings-security-row')))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.id('settings-security-row')).tap();
}

describe('2FA enroll → logout → login-with-TOTP (Doc 02 §2.11)', () => {
  beforeAll(async () => {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        "E2E_TEST_EMAIL / E2E_TEST_PASSWORD must be set — see this spec file's header comment.",
      );
    }
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('enrolls TOTP, requires it on the next login, and accepts the real code', async () => {
    // --- Enroll ---------------------------------------------------------
    await login();
    await openSecuritySettings();

    await element(by.id('security-2fa-enable-button')).tap();

    await waitFor(element(by.id('security-2fa-manual-secret')))
      .toBeVisible()
      .withTimeout(10000);
    const secretAttributes = await element(by.id('security-2fa-manual-secret')).getAttributes();
    // Detox's getAttributes() shape differs slightly between iOS/Android;
    // both expose the rendered string as `.text` for a Text element.
    const secret = ('text' in secretAttributes ? secretAttributes.text : undefined) as
      string | undefined;
    if (!secret) {
      throw new Error(
        'Could not read the TOTP secret off security-2fa-manual-secret — enroll UI may have changed.',
      );
    }

    await element(by.id('security-2fa-enroll-code-input')).typeText(generateTotpCode(secret));
    await element(by.id('security-2fa-confirm-enroll-button')).tap();

    // Recovery-codes step (Phase 8) shown once, right after enrollment.
    await waitFor(element(by.id('security-2fa-codes-continue-button')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('security-2fa-codes-continue-button')).tap();

    // --- Logout ------------------------------------------------------
    // BottomNav (and its "Plus" tab) persists across every (contractor)
    // screen via the shared _layout.tsx Slot — still reachable directly
    // from security-settings, no need to navigate back to dashboard first.
    await element(by.id('bottom-nav-plus')).tap();
    await element(by.id('plus-sheet-settings')).tap();
    await waitFor(element(by.id('settings-logout-row')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('settings-logout-row')).tap();
    // Native confirm alert (Alert.alert) — tap the destructive action by its
    // visible label, same on both platforms since it's a native alert, not
    // a Tamagui element with its own testID.
    await waitFor(element(by.text('Déconnexion')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('Déconnexion')).tap();

    // --- Login again — should now be challenged for a TOTP code ----------
    await waitFor(element(by.id('login-email-input')))
      .toBeVisible()
      .withTimeout(10000);
    await login();

    await waitFor(element(by.id('mfa-challenge-code-input')))
      .toBeVisible()
      .withTimeout(10000);
    // A fresh code: enough real time has passed since enrollment that the
    // 30s TOTP window has very likely rolled over, so recompute rather
    // than reusing the enrollment-time code.
    await element(by.id('mfa-challenge-code-input')).typeText(generateTotpCode(secret));
    await element(by.id('mfa-challenge-verify-button')).tap();

    await waitFor(element(by.id('bottom-nav-plus')))
      .toBeVisible()
      .withTimeout(10000);

    // --- Cleanup: leave the test account without a 2FA factor for the
    // next run of this spec ---------------------------------------------
    await openSecuritySettings();
    await waitFor(element(by.id('security-2fa-disable-button')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('security-2fa-disable-button')).tap();
    await waitFor(element(by.text('Désactiver')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('Désactiver')).tap();
  });
});

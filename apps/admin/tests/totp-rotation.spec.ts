import crypto from 'node:crypto';

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { loadFixtures } from './helpers/fixtures';
import { generateTotpCode } from './helpers/login';

const ALGORITHM = 'aes-256-gcm';

/**
 * Admin remediation Tier 2.7 — TOTP encryption key rotation.
 *
 * Cannot invoke supabase/functions/rotate-totp-encryption-key directly
 * (same disclosed limitation as every other Edge-Function-only feature
 * this suite has hit — services-health.spec.ts's invocation-log tests,
 * announcements.spec.ts's email-channel test). What this file DOES cover,
 * directly via the service-role client:
 *   1. The DB-layer rotation primitives migration 0061 added
 *      (current-version get/set, the Vault-write wrapper, the log table's
 *      CHECK constraint).
 *   2. The actual bug this tier fixed, end-to-end: that
 *      totp-secret-core.ts's encryptTotpSecretWithPool() now reads
 *      "current version" from the DB instead of a hardcoded constant —
 *      by flipping current_version, driving a REAL first-login TOTP
 *      enrollment through the app's own UI (not a shortcut), and
 *      confirming the resulting ciphertext is actually tagged with the
 *      new version. This is the one thing most worth regression-proofing
 *      here — a silent regression back to a hardcoded version would
 *      defeat the entire point of this tier without any other test
 *      catching it.
 */
test.describe('TOTP key rotation — DB primitives', () => {
  test('current-version get/set round-trips, defaulting to v1', async ({ page }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: initial } = await supabase.rpc('admin_get_current_totp_key_version');
    expect(initial).toBe('v1');

    try {
      const { error: setError } = await supabase.rpc('admin_set_current_totp_key_version', {
        p_new_version: 'v-test-roundtrip',
      });
      expect(setError).toBeNull();

      const { data: updated } = await supabase.rpc('admin_get_current_totp_key_version');
      expect(updated).toBe('v-test-roundtrip');
    } finally {
      await supabase.rpc('admin_set_current_totp_key_version', { p_new_version: 'v1' });
    }
  });

  test('totp_key_rotation_log rejects an invalid status', async ({ page }) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase.from('totp_key_rotation_log').insert({
      old_key_version: 'v1',
      new_key_version: 'v2',
      status: 'not_a_real_status',
    });
    expect(error).not.toBeNull();
  });
});

test.describe('TOTP key rotation — encryption actually follows current_version', () => {
  test('a fresh TOTP enrollment is tagged with whatever current_version says, not a hardcoded one', async ({
    page,
  }) => {
    const fixtures = loadFixtures();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Timestamped, not a plain increment — admin_create_totp_encryption_key_vault_secret
    // (0061) errors on a duplicate Vault entry name (same as
    // scripts/generate-totp-vault-key.ts's own documented behavior), so a
    // fixed version name would break on a second test run against a
    // Vault that already has it.
    const testVersion = `v-test-${Date.now()}`;
    const testKeyBase64 = crypto.randomBytes(32).toString('base64');

    const { error: vaultError } = await supabase.rpc(
      'admin_create_totp_encryption_key_vault_secret',
      { p_new_version: testVersion, p_key_base64: testKeyBase64 },
    );
    expect(vaultError).toBeNull();

    const { error: setError } = await supabase.rpc('admin_set_current_totp_key_version', {
      p_new_version: testVersion,
    });
    expect(setError).toBeNull();

    // Reset the dedicated target admin to a not-yet-enrolled state (same
    // fixture Tier 1.2's admin-users.spec.ts uses for the same reason —
    // NOT adminA/adminB/adminSupport/adminSuper, so this doesn't disrupt
    // any other spec file's login fixtures).
    await supabase
      .from('platform_admins')
      .update({ totp_secret: null, totp_enabled: false })
      .eq('id', fixtures.adminResetTarget.id);

    try {
      // Drive the real first-login TOTP setup flow through the app,
      // start to finish — not a DB shortcut.
      await page.goto('/login');
      await page.getByLabel('Email').fill(fixtures.adminResetTarget.email);
      await page.getByLabel('Mot de passe').fill(fixtures.adminResetTarget.password);
      await page.getByRole('button', { name: 'Continuer' }).click();
      await page.waitForURL('**/totp-setup');

      const setupRes = await page.request.get('/api/admin/login/totp-setup');
      const { secret } = await setupRes.json();
      expect(secret).toBeTruthy();

      const code = generateTotpCode(secret);
      await page.getByLabel('Code à 6 chiffres').fill(code);
      await page.getByRole('button', { name: 'Activer et se connecter' }).click();
      await page.waitForURL('**/dashboard');

      const { data: stored } = await supabase
        .from('platform_admins')
        .select('totp_secret')
        .eq('id', fixtures.adminResetTarget.id)
        .single();

      expect(stored?.totp_secret).toMatch(new RegExp(`^${testVersion}\\.`));

      // Round-trip check: the new ciphertext should actually decrypt back
      // to the same secret the enrollment page displayed, using the test
      // key directly (bypassing the app entirely) — confirms this isn't
      // just a correctly-labeled prefix on the wrong bytes.
      const [, ivB64, tagB64, ciphertextB64] = (stored!.totp_secret as string).split('.');
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        Buffer.from(testKeyBase64, 'base64'),
        Buffer.from(ivB64!, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64!, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      expect(decrypted).toBe(secret);
    } finally {
      await supabase.rpc('admin_set_current_totp_key_version', { p_new_version: 'v1' });
    }
  });
});

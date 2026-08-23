/**
 * apps/admin/src/lib/crypto/totp-secret-core.ts
 *
 * Pure encrypt/decrypt logic, parameterized on a `pg.Pool` the caller
 * provides — deliberately has no 'server-only' import and no dependency
 * on lib/db-explorer/pg-client.ts's shared pool singleton, so it can be
 * imported from Playwright test setup / one-off scripts (which run under
 * plain `tsx`, not Next's webpack build) without tripping 'server-only's
 * unconditional throw. `lib/crypto/totp-secret.ts` is the 'server-only'-
 * guarded wrapper the actual app route handlers import; this file is
 * where the real logic lives so it isn't duplicated between the two.
 *
 * ADMIN REMEDIATION TIER 2.7 FIX: `CURRENT_KEY_VERSION` used to be a
 * hardcoded module constant ('v1', forever) — every encryption always
 * tagged itself with that literal string regardless of what Vault key
 * was actually meant to be "current." That silently defeated key
 * rotation: rotate-totp-encryption-key (0061) can re-encrypt every
 * EXISTING platform_admins row with a new key, but without this fix, any
 * NEW encryption after that (admin.reset_totp, Tier 1.2; first-login TOTP
 * setup) would keep using the old hardcoded version forever, since
 * nothing here ever read a "rotation happened" signal. Fixed by reading
 * the current version from `admin_get_current_totp_key_version()`
 * (0061's totp_encryption_key_state table) at encrypt time instead —
 * that's the one value rotate-totp-encryption-key actually flips once a
 * rotation completes successfully.
 */
import crypto from 'node:crypto';

import type { Pool } from 'pg';

const ALGORITHM = 'aes-256-gcm';

export async function getEncryptionKey(pool: Pool, version: string): Promise<Buffer> {
  const result = await pool.query<{ key: string | null }>(
    'select admin_get_totp_encryption_key($1) as key',
    [version],
  );
  const base64Key = result.rows[0]?.key;
  if (!base64Key) {
    throw new Error(
      `No TOTP encryption key found in Vault for version "${version}". ` +
        'Run `pnpm generate-totp-vault-key` once before any admin can complete TOTP setup.',
    );
  }
  return Buffer.from(base64Key, 'base64');
}

async function getCurrentKeyVersion(pool: Pool): Promise<string> {
  const result = await pool.query<{ admin_get_current_totp_key_version: string | null }>(
    'select admin_get_current_totp_key_version()',
  );
  const version = result.rows[0]?.admin_get_current_totp_key_version;
  if (!version) {
    throw new Error(
      'totp_encryption_key_state has no current_version row (migration 0061 should have seeded one).',
    );
  }
  return version;
}

export async function encryptTotpSecretWithPool(pool: Pool, plaintext: string): Promise<string> {
  const version = await getCurrentKeyVersion(pool);
  const key = await getEncryptionKey(pool, version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    version,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export async function decryptTotpSecretWithPool(pool: Pool, stored: string): Promise<string> {
  const parts = stored.split('.');
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted TOTP secret (expected 4 dot-separated parts).');
  }
  const [version, ivB64, tagB64, ciphertextB64] = parts;
  const key = await getEncryptionKey(pool, version!);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64!, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64!, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

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
 */
import crypto from 'node:crypto';

import type { Pool } from 'pg';

const ALGORITHM = 'aes-256-gcm';
const CURRENT_KEY_VERSION = 'v1';

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

export async function encryptTotpSecretWithPool(pool: Pool, plaintext: string): Promise<string> {
  const version = CURRENT_KEY_VERSION;
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

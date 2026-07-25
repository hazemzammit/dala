/**
 * apps/admin/src/lib/crypto/totp-secret.ts
 *
 * Doc 01 §1.3.11 — "encrypted at the application layer (AES-256-GCM), key
 * in Supabase Vault." This is the 'server-only'-guarded wrapper every
 * route handler imports; the actual encrypt/decrypt logic lives in
 * ./totp-secret-core.ts (no 'server-only' import there, so Playwright
 * test setup and one-off scripts can reuse it directly — see
 * tests/global-setup.ts).
 */
import 'server-only';

import { getPgPool } from '../db-explorer/pg-client';

import { decryptTotpSecretWithPool, encryptTotpSecretWithPool } from './totp-secret-core';

export async function encryptTotpSecret(plaintext: string): Promise<string> {
  return encryptTotpSecretWithPool(getPgPool(), plaintext);
}

export async function decryptTotpSecret(stored: string): Promise<string> {
  return decryptTotpSecretWithPool(getPgPool(), stored);
}

/**
 * apps/admin/tests/global-setup.ts
 *
 * Runs once before the whole suite. Seeds two admin accounts (with known
 * passwords + TOTP secrets, so tests can log in end-to-end through the
 * real two-step flow rather than mocking it), a test organization, an
 * owner user, and a lower-privilege "worker" user to impersonate.
 *
 * Requires local Supabase running (`supabase start`) and the TOTP Vault
 * key already bootstrapped (`pnpm generate-totp-vault-key`) — fails fast
 * with a clear message if either is missing, rather than a confusing
 * downstream test failure.
 *
 * Deliberately imports totp-secret-core.ts (not lib/crypto/totp-secret.ts)
 * and constructs its own `pg.Pool` — the 'server-only' guard on the real
 * app wrapper throws unconditionally outside Next's webpack build, and
 * this file runs under plain ts-node/tsx via Playwright, not through Next.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import * as OTPAuth from 'otpauth';
import { Pool } from 'pg';

import { encryptTotpSecretWithPool } from '../src/lib/crypto/totp-secret-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../.env.local') });

const FIXTURES_PATH = path.resolve(__dirname, '.e2e-fixtures.json');

export const TEST_FIXTURES = {
  adminA: {
    email: 'e2e-admin-a@dala.tn',
    password: 'e2e-test-password-A1!',
    role: 'admin' as const,
  },
  adminB: {
    email: 'e2e-admin-b@dala.tn',
    password: 'e2e-test-password-B1!',
    role: 'admin' as const,
  },
  orgOwner: { email: 'e2e-org-owner@dala.tn', password: 'e2e-test-password-O1!' },
  targetWorker: { email: 'e2e-target-worker@dala.tn', password: 'e2e-test-password-W1!' },
  orgName: 'E2E Test Org — Playwright',
};

function generateTotpCode(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

async function upsertAuthUser(
  supabase: SupabaseClient<any, any, any>,
  email: string,
  password: string,
): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);
  if (found) return found.id;

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) {
    throw new Error(`Failed to create test auth user ${email}: ${error?.message}`);
  }
  return created.user.id;
}

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const connectionString = process.env.DATABASE_URL;

  if (!url || !serviceRoleKey || !connectionString) {
    throw new Error(
      'Missing Supabase env vars. Run `supabase start` and confirm apps/admin/.env.local ' +
        'has NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL set.',
    );
  }

  const supabase = createClient<any, any, any>(url, serviceRoleKey);
  const pool = new Pool({ connectionString });

  try {
    // --- Two admins, both with a known, pre-encrypted TOTP secret so
    // tests can compute a valid code with `otpauth` directly instead of
    // going through the interactive first-login enrollment screen.
    for (const admin of [TEST_FIXTURES.adminA, TEST_FIXTURES.adminB]) {
      const userId = await upsertAuthUser(supabase, admin.email, admin.password);
      const totpSecret = new OTPAuth.Secret({ size: 20 }).base32;
      const encryptedSecret = await encryptTotpSecretWithPool(pool, totpSecret);

      await supabase.from('platform_admins').upsert({
        id: userId,
        full_name: admin.email,
        role: admin.role,
        totp_enabled: true,
        totp_secret: encryptedSecret,
      });

      // Stash the plaintext secret + a code-generator on the fixture object
      // itself — tests need it to compute a fresh 6-digit code at login
      // time (a TOTP code is time-based, so it can't be precomputed here).
      (admin as any).totpSecret = totpSecret;
    }

    // --- Test organization + owner + a lower-privilege target user.
    const ownerId = await upsertAuthUser(
      supabase,
      TEST_FIXTURES.orgOwner.email,
      TEST_FIXTURES.orgOwner.password,
    );
    const targetId = await upsertAuthUser(
      supabase,
      TEST_FIXTURES.targetWorker.email,
      TEST_FIXTURES.targetWorker.password,
    );

    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('name', TEST_FIXTURES.orgName)
      .maybeSingle();

    const orgId =
      existingOrg?.id ??
      (
        await supabase
          .from('organizations')
          .insert({ name: TEST_FIXTURES.orgName, created_by: ownerId, plan: 'free' })
          .select('id')
          .single()
      ).data?.id;

    if (!orgId) throw new Error('Failed to create test organization.');

    await supabase
      .from('organization_members')
      .upsert({ org_id: orgId, user_id: ownerId, role: 'owner' }, { onConflict: 'org_id,user_id' });
    await supabase
      .from('organization_members')
      .upsert(
        { org_id: orgId, user_id: targetId, role: 'worker' },
        { onConflict: 'org_id,user_id' },
      );

    fs.writeFileSync(
      FIXTURES_PATH,
      JSON.stringify(
        {
          adminA: { ...TEST_FIXTURES.adminA, totpSecret: (TEST_FIXTURES.adminA as any).totpSecret },
          adminB: { ...TEST_FIXTURES.adminB, totpSecret: (TEST_FIXTURES.adminB as any).totpSecret },
          orgOwner: TEST_FIXTURES.orgOwner,
          targetWorker: TEST_FIXTURES.targetWorker,
          orgName: TEST_FIXTURES.orgName,
          orgId,
          targetUserId: targetId,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

export { generateTotpCode };

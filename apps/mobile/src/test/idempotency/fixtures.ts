import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/idempotency/fixtures.ts
 *
 * Doc 01 §1.11 / Doc 02 §2.11's "Idempotency" row. Deliberately its OWN
 * fixture module, not a reuse of `../rls/fixtures.ts` — that module builds
 * a 3-org/4-user/shared-project/worker/vehicle/dispatch/expense graph
 * sized for cross-org isolation assertions, which this suite doesn't need
 * at all. All this needs is one org, one owner (owner/manager-gated —
 * `create_advance` checks `org_role_of(p_org_id) in ('owner','manager')`),
 * and one worker. Reusing the RLS module's heavier fixture would couple
 * this suite's setup cost and failure surface to a graph shape that has
 * nothing to do with what's under test here.
 *
 * Same disclosed limitation as every other integration suite in this repo:
 * written and checked against the actual schema (`create_advance`'s real
 * parameter names/order, migration 0019) but NOT executed against a live
 * instance from this session — no Docker/local Supabase available here.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface IdempotencyFixtures {
  orgId: string;
  owner: FixtureUser;
  workerId: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — the idempotency suite needs a local Supabase instance ` +
        `(run \`supabase start\`) and this env var pointing at it. See ` +
        `apps/mobile/jest.integration.config.js.`,
    );
  }
  return value;
}

export function hasLocalSupabaseEnv(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function serviceClient(): SupabaseClient {
  const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** A fresh anon-key client signed in as the fixture owner — every assertion
 * must go through this, never the service-role client, or RLS/RPC
 * permission checks (`org_role_of`) would never actually run. */
export async function asUser(user: FixtureUser): Promise<SupabaseClient> {
  const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const anonKey = requireEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`Failed to sign in fixture user ${user.email}: ${error.message}`);
  return client;
}

export async function createFixtures(): Promise<IdempotencyFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  const email = `idempotency-test-owner-${suffix}@dala.test`;
  const password = 'IdemTest1234!';
  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userErr || !userData.user) {
    throw new Error(`Failed to create fixture owner: ${userErr?.message}`);
  }
  const owner: FixtureUser = { userId: userData.user.id, email, password };

  const { data: orgData, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `Idempotency Test Org ${suffix}`, created_by: owner.userId })
    .select('id')
    .single();
  if (orgErr || !orgData) throw new Error(`Failed to create org: ${orgErr?.message}`);
  const orgId = orgData.id as string;

  const { error: memberErr } = await admin
    .from('organization_members')
    .insert({ org_id: orgId, user_id: owner.userId, role: 'owner' });
  if (memberErr) throw new Error(`Failed to create org membership: ${memberErr.message}`);

  const { data: workerData, error: workerErr } = await admin
    .from('workers')
    .insert({ org_id: orgId, full_name: `Idempotency Test Worker ${suffix}` })
    .select('id')
    .single();
  if (workerErr || !workerData) throw new Error(`Failed to create worker: ${workerErr?.message}`);
  const workerId = workerData.id as string;

  return { orgId, owner, workerId };
}

export async function teardownFixtures(fixtures: IdempotencyFixtures): Promise<void> {
  const admin = serviceClient();
  await admin.from('organizations').delete().eq('id', fixtures.orgId);
  await admin.auth.admin.deleteUser(fixtures.owner.userId);
}

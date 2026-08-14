import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/rollup/fixtures.ts
 *
 * Doc 01 §1.17.1's "no super-owner" constraint / Doc 02 §2.11's cross-org
 * rollup isolation row: "assert the rollup screen's per-org data never
 * appears in a query spanning both orgs at the database layer — a
 * regression test for the 'no super-owner' constraint, not just a feature
 * test."
 *
 * What this actually tests, made precise after reading §1.17.1 and
 * vue-ensemble.tsx (the mobile rollup screen) before writing this: an
 * account that is a member of Org A only must never see Org B's rows, even
 * from a query whose FILTER superficially spans both org_ids (e.g.
 * `.in('org_id', [orgA, orgB])`) — not just from separate per-account
 * queries, which ../rls/fixtures.ts's Org C isolation tests already cover.
 * This is a query-shape regression, not a duplicate of Phase 11's suite:
 * it specifically guards against RLS ever being satisfied by "the account
 * is a member of AT LEAST ONE of the org_ids in this filter" instead of
 * "the account is a member of the org_id on THIS row" — the two would
 * behave identically for a single-org filter, but diverge exactly on a
 * multi-org `.in()` filter, which is what a genuine multi-org rollup query
 * looks like.
 *
 * Own fixture module, not a reuse of ../rls/fixtures.ts — that module's
 * three orgs are wired together with a shared project, cross-org
 * dispatch/expense data, and multiple role combinations, none of which
 * this suite needs. This just needs two independent orgs and one account
 * that owns Org A only, each org with its own project as the row this
 * suite checks visibility of.
 *
 * Same disclosed limitation as every other integration suite in this repo:
 * written and checked against the actual RLS policy (`projects_select_lead_
 * or_trade` → `is_org_member(lead_org_id)`, migration 0006) but NOT
 * executed against a live instance from this session — no Docker/local
 * Supabase available here.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface RollupFixtures {
  orgAId: string;
  orgBId: string;
  ownerA: FixtureUser; // member of Org A ONLY — never Org B
  ownerBUserId: string; // tracked only for teardown cleanup — no test in this suite ever signs in as this account
  projectAId: string;
  projectBId: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — the rollup isolation suite needs a local Supabase instance ` +
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
 * must go through this, never the service-role client, or the RLS policies
 * under test would never actually run. */
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

export async function createFixtures(): Promise<RollupFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  // Org A — the account under test belongs here, and ONLY here.
  const emailA = `rollup-test-owner-a-${suffix}@dala.test`;
  const passwordA = 'RollupTestA1234!';
  const { data: userAData, error: userAErr } = await admin.auth.admin.createUser({
    email: emailA,
    password: passwordA,
    email_confirm: true,
  });
  if (userAErr || !userAData.user) {
    throw new Error(`Failed to create Org A fixture owner: ${userAErr?.message}`);
  }
  const ownerA: FixtureUser = { userId: userAData.user.id, email: emailA, password: passwordA };

  const { data: orgAData, error: orgAErr } = await admin
    .from('organizations')
    .insert({ name: `Rollup Test Org A ${suffix}`, created_by: ownerA.userId })
    .select('id')
    .single();
  if (orgAErr || !orgAData) throw new Error(`Failed to create Org A: ${orgAErr?.message}`);
  const orgAId = orgAData.id as string;

  const { error: memberAErr } = await admin
    .from('organization_members')
    .insert({ org_id: orgAId, user_id: ownerA.userId, role: 'owner' });
  if (memberAErr) throw new Error(`Failed to create Org A membership: ${memberAErr.message}`);

  const { data: projectAData, error: projectAErr } = await admin
    .from('projects')
    .insert({
      lead_org_id: orgAId,
      name: `Rollup Test Project A ${suffix}`,
      created_by: ownerA.userId,
    })
    .select('id')
    .single();
  if (projectAErr || !projectAData)
    throw new Error(`Failed to create Project A: ${projectAErr?.message}`);
  const projectAId = projectAData.id as string;

  // Org B — an entirely separate account, unrelated to ownerA. ownerA gets
  // NO organization_members row here — that's the entire point.
  const emailB = `rollup-test-owner-b-${suffix}@dala.test`;
  const passwordB = 'RollupTestB1234!';
  const { data: userBData, error: userBErr } = await admin.auth.admin.createUser({
    email: emailB,
    password: passwordB,
    email_confirm: true,
  });
  if (userBErr || !userBData.user) {
    throw new Error(`Failed to create Org B fixture owner: ${userBErr?.message}`);
  }

  const { data: orgBData, error: orgBErr } = await admin
    .from('organizations')
    .insert({ name: `Rollup Test Org B ${suffix}`, created_by: userBData.user.id })
    .select('id')
    .single();
  if (orgBErr || !orgBData) throw new Error(`Failed to create Org B: ${orgBErr?.message}`);
  const orgBId = orgBData.id as string;

  const { error: memberBErr } = await admin
    .from('organization_members')
    .insert({ org_id: orgBId, user_id: userBData.user.id, role: 'owner' });
  if (memberBErr) throw new Error(`Failed to create Org B membership: ${memberBErr.message}`);

  const { data: projectBData, error: projectBErr } = await admin
    .from('projects')
    .insert({
      lead_org_id: orgBId,
      name: `Rollup Test Project B ${suffix}`,
      created_by: userBData.user.id,
    })
    .select('id')
    .single();
  if (projectBErr || !projectBData)
    throw new Error(`Failed to create Project B: ${projectBErr?.message}`);
  const projectBId = projectBData.id as string;

  return { orgAId, orgBId, ownerA, ownerBUserId: userBData.user.id, projectAId, projectBId };
}

export async function teardownFixtures(fixtures: RollupFixtures): Promise<void> {
  const admin = serviceClient();
  // Deleting the orgs cascades to their projects/memberships (organizations
  // FK'd with on delete cascade throughout, per every prior migration's
  // schema — see e.g. 0006's lead_org_id reference).
  await admin.from('organizations').delete().eq('id', fixtures.orgAId);
  await admin.from('organizations').delete().eq('id', fixtures.orgBId);
  await admin.auth.admin.deleteUser(fixtures.ownerA.userId);
  await admin.auth.admin.deleteUser(fixtures.ownerBUserId);
}

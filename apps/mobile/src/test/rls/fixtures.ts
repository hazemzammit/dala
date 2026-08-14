import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/rls/fixtures.ts
 *
 * Doc 02 §2.11's "RLS / security" row — the fixture infrastructure that
 * row has been waiting on since Phase 9 flagged it as a follow-up. This is
 * genuinely new: `supabase/seed.sql` is a fixed, global, `db reset`-time
 * dataset meant for manual dev use — it can't be called per-test with
 * unique isolated data and torn down afterward, which is what a real test
 * suite needs. This module fills that gap.
 *
 * How it works: uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) to create a
 * fresh, randomly-suffixed set of orgs/users/projects/memberships per test
 * run, then signs in as each created user with a SEPARATE anon-key client
 * so that RLS is genuinely enforced the way the real app experiences it —
 * tests must never run their assertions through the service-role client,
 * only through `asUser()`'s client, or they'd be testing nothing.
 *
 * Requires a real local Supabase instance (`supabase start`) and
 * `SUPABASE_SERVICE_ROLE_KEY` / `EXPO_PUBLIC_SUPABASE_URL` /
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY` set in the environment — see
 * `apps/mobile/jest.integration.config.js` and the root `.env.example`.
 * This was written but NOT executed against a live instance from this
 * session (no Docker/local Supabase available here) — same disclosed
 * limitation as every other live-verification item this phase.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface RlsFixtures {
  // Org A — the "lead" org for the shared project below.
  orgA: string;
  ownerA: FixtureUser;
  managerA: FixtureUser;
  // Org B — invited onto the shared project as a trade participant.
  orgB: string;
  ownerB: FixtureUser;
  // Org C — has no relationship to the project or orgs A/B at all.
  // Used purely for cross-org isolation assertions.
  orgC: string;
  ownerC: FixtureUser;
  // A project led by Org A, with Org B invited as 'trade'.
  sharedProjectId: string;
  // A worker + vehicle + dispatch assignment + expense on the shared
  // project, all recorded under Org A, for the isolation/visibility checks.
  workerA: string;
  vehicleA: string;
  dispatchAssignmentId: string;
  expenseId: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — the RLS matrix suite needs a local Supabase instance ` +
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

/**
 * Exported for test files that need one-off service-role setup calls this
 * module doesn't already provide a named helper for (e.g. flipping a
 * project's status to `archived` for the archived-project-write-freeze
 * regression tests, 0038) — same "setup via service-role, assert via
 * asUser()" split every other fixture helper here already follows; this
 * just avoids each test file re-implementing its own admin client.
 */
export function serviceClient(): SupabaseClient {
  const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * A fresh anon-key client, signed in as one fixture user. Every RLS
 * assertion in the matrix suite must go through a client created this way
 * — never through the service-role client, which bypasses RLS entirely.
 */
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

async function createFixtureUser(admin: SupabaseClient, label: string): Promise<FixtureUser> {
  const suffix = randomSuffix();
  const email = `rls-test-${label}-${suffix}@dala.test`;
  const password = 'RlsTest1234!';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create fixture user ${email}: ${error?.message}`);
  }
  return { userId: data.user.id, email, password };
}

/**
 * Builds one full, isolated fixture set: 3 orgs, 3 owner accounts, one
 * extra manager account on Org A, a shared project (Org A lead, Org B
 * trade), and a worker/vehicle/dispatch-assignment/expense on that
 * project under Org A — matching the shapes exercised by the RLS matrix
 * tests below. Every id is randomly suffixed so parallel/repeated test
 * runs never collide, unlike seed.sql's fixed literals.
 */
export async function createFixtures(): Promise<RlsFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  const ownerA = await createFixtureUser(admin, 'owner-a');
  const managerA = await createFixtureUser(admin, 'manager-a');
  const ownerB = await createFixtureUser(admin, 'owner-b');
  const ownerC = await createFixtureUser(admin, 'owner-c');

  const { data: orgAData, error: orgAErr } = await admin
    .from('organizations')
    .insert({ name: `RLS Test Org A ${suffix}`, created_by: ownerA.userId })
    .select('id')
    .single();
  if (orgAErr || !orgAData) throw new Error(`Failed to create Org A: ${orgAErr?.message}`);
  const orgA = orgAData.id as string;

  const { data: orgBData, error: orgBErr } = await admin
    .from('organizations')
    .insert({ name: `RLS Test Org B ${suffix}`, created_by: ownerB.userId })
    .select('id')
    .single();
  if (orgBErr || !orgBData) throw new Error(`Failed to create Org B: ${orgBErr?.message}`);
  const orgB = orgBData.id as string;

  const { data: orgCData, error: orgCErr } = await admin
    .from('organizations')
    .insert({ name: `RLS Test Org C ${suffix}`, created_by: ownerC.userId })
    .select('id')
    .single();
  if (orgCErr || !orgCData) throw new Error(`Failed to create Org C: ${orgCErr?.message}`);
  const orgC = orgCData.id as string;

  const { error: membersErr } = await admin.from('organization_members').insert([
    { org_id: orgA, user_id: ownerA.userId, role: 'owner' },
    { org_id: orgA, user_id: managerA.userId, role: 'manager' },
    { org_id: orgB, user_id: ownerB.userId, role: 'owner' },
    { org_id: orgC, user_id: ownerC.userId, role: 'owner' },
  ]);
  if (membersErr) throw new Error(`Failed to create org memberships: ${membersErr.message}`);

  const { data: projectData, error: projectErr } = await admin
    .from('projects')
    .insert({
      lead_org_id: orgA,
      name: `RLS Test Shared Project ${suffix}`,
      status: 'active',
      created_by: ownerA.userId,
    })
    .select('id')
    .single();
  if (projectErr || !projectData)
    throw new Error(`Failed to create project: ${projectErr?.message}`);
  const sharedProjectId = projectData.id as string;

  const { error: pmLeadErr } = await admin
    .from('project_memberships')
    .insert({ project_id: sharedProjectId, org_id: orgA, role: 'lead' });
  if (pmLeadErr) throw new Error(`Failed to create lead membership: ${pmLeadErr.message}`);

  const { error: pmTradeErr } = await admin
    .from('project_memberships')
    .insert({ project_id: sharedProjectId, org_id: orgB, role: 'trade' });
  if (pmTradeErr) throw new Error(`Failed to create trade membership: ${pmTradeErr.message}`);

  const { data: workerData, error: workerErr } = await admin
    .from('workers')
    .insert({ org_id: orgA, full_name: `RLS Test Worker ${suffix}` })
    .select('id')
    .single();
  if (workerErr || !workerData) throw new Error(`Failed to create worker: ${workerErr?.message}`);
  const workerA = workerData.id as string;

  const { data: vehicleData, error: vehicleErr } = await admin
    .from('vehicles')
    .insert({ org_id: orgA, name: `RLS Test Vehicle ${suffix}`, capacity: 4 })
    .select('id')
    .single();
  if (vehicleErr || !vehicleData)
    throw new Error(`Failed to create vehicle: ${vehicleErr?.message}`);
  const vehicleA = vehicleData.id as string;

  const { data: assignmentData, error: assignmentErr } = await admin
    .from('dispatch_assignments')
    .insert({
      org_id: orgA,
      project_id: sharedProjectId,
      vehicle_id: vehicleA,
      worker_id: workerA,
      assignment_date: new Date().toISOString().slice(0, 10),
    })
    .select('id')
    .single();
  if (assignmentErr || !assignmentData) {
    throw new Error(`Failed to create dispatch assignment: ${assignmentErr?.message}`);
  }
  const dispatchAssignmentId = assignmentData.id as string;

  const { data: expenseData, error: expenseErr } = await admin
    .from('project_expenses')
    .insert({
      org_id: orgA,
      project_id: sharedProjectId,
      category: 'materiaux',
      amount: 100,
      expense_date: new Date().toISOString().slice(0, 10),
      created_by: ownerA.userId,
    })
    .select('id')
    .single();
  if (expenseErr || !expenseData)
    throw new Error(`Failed to create expense: ${expenseErr?.message}`);
  const expenseId = expenseData.id as string;

  return {
    orgA,
    ownerA,
    managerA,
    orgB,
    ownerB,
    orgC,
    ownerC,
    sharedProjectId,
    workerA,
    vehicleA,
    dispatchAssignmentId,
    expenseId,
  };
}

/**
 * Tears down everything `createFixtures` created, in FK-safe order.
 * `organizations` cascades to most org-scoped tables (`on delete cascade`
 * per their migrations), so deleting the three orgs handles
 * memberships/workers/vehicles/dispatch_assignments/project_expenses too
 * — only `projects` (referenced by `lead_org_id`, also cascading) and the
 * three auth users need their own explicit cleanup.
 */
export async function teardownFixtures(fixtures: RlsFixtures): Promise<void> {
  const admin = serviceClient();

  await admin.from('organizations').delete().eq('id', fixtures.orgA);
  await admin.from('organizations').delete().eq('id', fixtures.orgB);
  await admin.from('organizations').delete().eq('id', fixtures.orgC);

  await admin.auth.admin.deleteUser(fixtures.ownerA.userId);
  await admin.auth.admin.deleteUser(fixtures.managerA.userId);
  await admin.auth.admin.deleteUser(fixtures.ownerB.userId);
  await admin.auth.admin.deleteUser(fixtures.ownerC.userId);
}

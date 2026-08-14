import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/sync/fixtures.ts
 *
 * Doc 02 §2.11's "Offline conflicts" row / Doc 01 §1.9. Its own fixture
 * module, same reasoning as `../idempotency/fixtures.ts` and
 * `../attendance/fixtures.ts` — this suite's graph doesn't match either of
 * those, so it isn't reused.
 *
 * NEW compared to every prior fixture module in this repo: a WORKER-LINKED
 * auth account, not just an owner. `request_advance` and
 * `submit_site_log_entry` (migration 0019/0020) both resolve the caller's
 * worker row via `workers.user_id = auth.uid()` — no prior integration
 * suite in this repo exercised either RPC, so no prior fixture module
 * needed a worker with a real sign-in identity. Built here for the first
 * time: a second auth user, whose auto-created `profiles` row (0002's
 * `after insert on auth.users` trigger) is then linked from `workers.user_id`.
 *
 * Also provides one `vehicles` row and one `projects` row (`lead_org_id` =
 * this fixture's org — `submit_site_log_entry` checks
 * `projects.lead_org_id = worker's org_id`) and one seeded
 * `dispatch_assignments` row for the version-conflict test.
 *
 * SCOPE NOTE, disclosed rather than silently worked around: this fixture
 * module, and every test file that uses it, exercises the RPC/table
 * contract that `apps/mobile/src/db/sync/pushChanges.ts` and
 * `pullChanges.ts` depend on — via the same raw `asUser()`/service-role
 * pattern every other DB-integration suite in this repo already uses — NOT
 * by importing `pushChanges.ts`/`pullChanges.ts` themselves. Both of those
 * files transitively import `@/lib/supabase.ts`, which imports
 * `expo-secure-store` and `react-native-url-polyfill/auto` — real native
 * modules with no equivalent under this suite's plain-`node` Jest
 * environment (`jest.integration.config.js`'s own header explains why that
 * environment was chosen: these suites "only ever call
 * `@supabase/supabase-js` over HTTP", never an RN-coupled app module).
 * Importing either sync file directly here would either throw at import
 * time or hang on an unauthenticated `getActiveOrgId()` call with no way to
 * inject a session, for a module never designed to be unit-tested outside
 * a running RN app. Testing the underlying database contract those files
 * assume is what's actually achievable and useful here; genuinely testing
 * `pushChanges.ts`/`pullChanges.ts` as TypeScript modules would need either
 * a mocked `expo-secure-store` or a refactor to accept an injected
 * Supabase client — both out of this phase's scope (item 5 is "add tests,"
 * not "refactor sync/ for testability"). `conflictResolver.ts` is the one
 * exception — it has zero runtime RN/Expo imports (only a type-only import
 * from `@nozbe/watermelondb/sync`, erased at compile time) — so
 * `conflictResolver.test.ts` imports and calls the real function directly.
 *
 * Same disclosed limitation as every other integration suite in this repo:
 * written and checked against the actual schema (migrations 0006, 0019,
 * 0020, 0047) but NOT executed against a live instance from this
 * session — no Docker/local Supabase available here.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface SyncFixtures {
  orgId: string;
  owner: FixtureUser;
  /** A worker WITH a linked auth account — required for `request_advance`
   * and `submit_site_log_entry`, which resolve the worker via
   * `workers.user_id = auth.uid()`. */
  workerUser: FixtureUser;
  workerId: string;
  projectId: string;
  vehicleId: string;
  /** A single seeded `dispatch_assignments` row, `version` = 1, for the
   * stale-version conflict test. */
  dispatchAssignmentId: string;
  /** A second org, for pullChanges' org-scoping assertion — a second
   * org's data must never appear in a pull scoped to the first. */
  otherOrgId: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — the sync-engine suite needs a local Supabase ` +
        `instance (run \`supabase start\`) and this env var pointing at it. ` +
        `See apps/mobile/jest.integration.config.js.`,
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

/** A fresh anon-key client signed in as the given fixture user — every
 * assertion must go through this, never the service-role client, or
 * RLS/RPC permission checks would never actually run. */
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

export async function createFixtures(): Promise<SyncFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  const ownerEmail = `sync-test-owner-${suffix}@dala.test`;
  const ownerPassword = 'SyncTest1234!';
  const { data: ownerData, error: ownerErr } = await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (ownerErr || !ownerData.user) {
    throw new Error(`Failed to create fixture owner: ${ownerErr?.message}`);
  }
  const owner: FixtureUser = {
    userId: ownerData.user.id,
    email: ownerEmail,
    password: ownerPassword,
  };

  const { data: orgData, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: `Sync Test Org ${suffix}`, created_by: owner.userId })
    .select('id')
    .single();
  if (orgErr || !orgData) throw new Error(`Failed to create org: ${orgErr?.message}`);
  const orgId = orgData.id as string;

  const { error: memberErr } = await admin
    .from('organization_members')
    .insert({ org_id: orgId, user_id: owner.userId, role: 'owner' });
  if (memberErr) throw new Error(`Failed to create org membership: ${memberErr.message}`);

  // A second org, for pullChanges' org-scoping assertion.
  const { data: otherOrgData, error: otherOrgErr } = await admin
    .from('organizations')
    .insert({ name: `Sync Test Other Org ${suffix}`, created_by: owner.userId })
    .select('id')
    .single();
  if (otherOrgErr || !otherOrgData) {
    throw new Error(`Failed to create second org: ${otherOrgErr?.message}`);
  }
  const otherOrgId = otherOrgData.id as string;
  const { error: otherMemberErr } = await admin
    .from('organization_members')
    .insert({ org_id: otherOrgId, user_id: owner.userId, role: 'owner' });
  if (otherMemberErr) {
    throw new Error(`Failed to create second org membership: ${otherMemberErr.message}`);
  }

  // Worker WITH a linked auth account.
  const workerEmail = `sync-test-worker-${suffix}@dala.test`;
  const workerPassword = 'SyncTestWorker1234!';
  const { data: workerUserData, error: workerUserErr } = await admin.auth.admin.createUser({
    email: workerEmail,
    password: workerPassword,
    email_confirm: true,
  });
  if (workerUserErr || !workerUserData.user) {
    throw new Error(`Failed to create fixture worker user: ${workerUserErr?.message}`);
  }
  const workerUser: FixtureUser = {
    userId: workerUserData.user.id,
    email: workerEmail,
    password: workerPassword,
  };

  const { data: workerData, error: workerErr } = await admin
    .from('workers')
    .insert({
      org_id: orgId,
      full_name: `Sync Test Worker ${suffix}`,
      user_id: workerUser.userId,
    })
    .select('id')
    .single();
  if (workerErr || !workerData) throw new Error(`Failed to create worker: ${workerErr?.message}`);
  const workerId = workerData.id as string;

  const { data: projectData, error: projectErr } = await admin
    .from('projects')
    .insert({
      lead_org_id: orgId,
      name: `Sync Test Project ${suffix}`,
      created_by: owner.userId,
    })
    .select('id')
    .single();
  if (projectErr || !projectData)
    throw new Error(`Failed to create project: ${projectErr?.message}`);
  const projectId = projectData.id as string;

  const { data: vehicleData, error: vehicleErr } = await admin
    .from('vehicles')
    .insert({ org_id: orgId, name: `Sync Test Vehicle ${suffix}` })
    .select('id')
    .single();
  if (vehicleErr || !vehicleData)
    throw new Error(`Failed to create vehicle: ${vehicleErr?.message}`);
  const vehicleId = vehicleData.id as string;

  const { data: dispatchData, error: dispatchErr } = await admin
    .from('dispatch_assignments')
    .insert({
      org_id: orgId,
      project_id: projectId,
      vehicle_id: vehicleId,
      worker_id: workerId,
      assignment_date: new Date().toISOString().slice(0, 10),
      departure_time: '07:00',
      confirmation_channel: 'app',
    })
    .select('id')
    .single();
  if (dispatchErr || !dispatchData) {
    throw new Error(`Failed to create dispatch_assignments row: ${dispatchErr?.message}`);
  }
  const dispatchAssignmentId = dispatchData.id as string;

  return {
    orgId,
    owner,
    workerUser,
    workerId,
    projectId,
    vehicleId,
    dispatchAssignmentId,
    otherOrgId,
  };
}

export async function teardownFixtures(fixtures: SyncFixtures): Promise<void> {
  const admin = serviceClient();
  await admin.from('organizations').delete().eq('id', fixtures.orgId);
  await admin.from('organizations').delete().eq('id', fixtures.otherOrgId);
  await admin.auth.admin.deleteUser(fixtures.owner.userId);
  await admin.auth.admin.deleteUser(fixtures.workerUser.userId);
}

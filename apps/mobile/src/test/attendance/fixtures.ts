import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/attendance/fixtures.ts
 *
 * Doc 01 §1.14.3 / Doc 02 §2.11's "Attendance reconciliation" row. Its own
 * fixture module, same reasoning as `../idempotency/fixtures.ts`: this only
 * needs one org, one member account (attendance_records' insert policy is
 * `is_org_member(org_id)` — no owner/manager gate, unlike advances), and
 * one worker — no shared project graph needed.
 *
 * Same disclosed limitation as every other integration suite in this repo:
 * written and checked against the actual `attendance_records` schema
 * (migration 0007 — append-only, no unique constraint on worker_id +
 * record_date) but NOT executed against a live instance from this session.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface AttendanceFixtures {
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
      `${name} is not set — the attendance-reconciliation suite needs a local ` +
        `Supabase instance (run \`supabase start\`) and this env var pointing at ` +
        `it. See apps/mobile/jest.integration.config.js.`,
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

export async function createFixtures(): Promise<AttendanceFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  const email = `attendance-test-owner-${suffix}@dala.test`;
  const password = 'AttTest1234!';
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
    .insert({ name: `Attendance Test Org ${suffix}`, created_by: owner.userId })
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
    .insert({ org_id: orgId, full_name: `Attendance Test Worker ${suffix}` })
    .select('id')
    .single();
  if (workerErr || !workerData) throw new Error(`Failed to create worker: ${workerErr?.message}`);
  const workerId = workerData.id as string;

  return { orgId, owner, workerId };
}

export async function teardownFixtures(fixtures: AttendanceFixtures): Promise<void> {
  const admin = serviceClient();
  await admin.from('organizations').delete().eq('id', fixtures.orgId);
  await admin.auth.admin.deleteUser(fixtures.owner.userId);
}

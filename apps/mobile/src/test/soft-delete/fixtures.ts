import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/mobile/src/test/soft-delete/fixtures.ts
 *
 * Doc 01 §1.16.2 / Doc 02 §2.11's soft-delete/restore row: "delete a
 * project, assert excluded from normal queries but restorable within 30
 * days, then assert purge_soft_deleted_records removes it after."
 *
 * Own fixture module, not a reuse of ../rls/fixtures.ts or
 * ../idempotency/fixtures.ts — same reasoning as every suite since Phase
 * 12: this only needs one org, one owner (soft_delete_project/
 * restore_project are gated by `projects_write_owner_manager`'s
 * `org_role_of(lead_org_id) in ('owner','manager')`, migration 0006), and
 * one project. No worker, no second org, no dispatch/attendance data.
 *
 * Same disclosed limitation as every other integration suite in this repo:
 * written and checked against the actual schema (0013's
 * soft_delete_project/restore_project, 0025's current
 * purge_soft_deleted_records signature which now covers both projects and
 * workers) but NOT executed against a live instance from this session — no
 * Docker/local Supabase available here.
 */

export interface FixtureUser {
  userId: string;
  email: string;
  password: string;
}

export interface SoftDeleteFixtures {
  orgId: string;
  owner: FixtureUser;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — the soft-delete suite needs a local Supabase instance ` +
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
 * permission checks (`org_role_of`) would never actually run. The one
 * exception is backdating `deleted_at` to simulate the 30-day window
 * having passed, which this module's `backdateDeletedAt` helper does via
 * the service client deliberately — see that function's own comment. */
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

export async function createFixtures(): Promise<SoftDeleteFixtures> {
  const admin = serviceClient();
  const suffix = randomSuffix();

  const email = `soft-delete-test-owner-${suffix}@dala.test`;
  const password = 'SoftDelTest1234!';
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
    .insert({ name: `Soft Delete Test Org ${suffix}`, created_by: owner.userId })
    .select('id')
    .single();
  if (orgErr || !orgData) throw new Error(`Failed to create org: ${orgErr?.message}`);
  const orgId = orgData.id as string;

  const { error: memberErr } = await admin
    .from('organization_members')
    .insert({ org_id: orgId, user_id: owner.userId, role: 'owner' });
  if (memberErr) throw new Error(`Failed to create org membership: ${memberErr.message}`);

  return { orgId, owner };
}

/** Creates a fresh project for one test case. Not folded into
 * createFixtures() — several tests in this suite each want their own
 * untouched project rather than sharing state across assertions. */
export async function createProject(
  orgId: string,
  ownerUserId: string,
  name: string,
): Promise<string> {
  const admin = serviceClient();
  const { data, error } = await admin
    .from('projects')
    .insert({ lead_org_id: orgId, name, created_by: ownerUserId })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Failed to create project: ${error?.message}`);
  return data.id as string;
}

/** Sets deleted_at directly to a specific point in the past, bypassing
 * soft_delete_project()'s hardcoded now(). This is the service-role client
 * deliberately, not asUser() — not because RLS should be skipped for the
 * write (an owner CAN update deleted_at on their own org's project via
 * `projects_write_owner_manager`, no column restriction), but because
 * fabricating an artificial timestamp to simulate 31 real days having
 * passed isn't itself the thing under test; the RESTORE and PURGE calls
 * that follow it are, and those still go through asUser(). */
export async function backdateDeletedAt(projectId: string, daysAgo: number): Promise<void> {
  const admin = serviceClient();
  const timestamp = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const { error } = await admin
    .from('projects')
    .update({ deleted_at: timestamp })
    .eq('id', projectId);
  if (error) throw new Error(`Failed to backdate deleted_at: ${error.message}`);
}

export async function teardownFixtures(fixtures: SoftDeleteFixtures): Promise<void> {
  const admin = serviceClient();
  await admin.from('organizations').delete().eq('id', fixtures.orgId);
  await admin.auth.admin.deleteUser(fixtures.owner.userId);
}

import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type SyncFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/sync/pullChanges.test.ts
 *
 * Doc 02 §2.11's "Offline conflicts" row / Doc 01 §1.9. Same scope
 * disclosure as `./pushChanges.test.ts` and explained fully in
 * `./fixtures.ts`'s own header: `pullChanges.ts` transitively imports
 * `@/lib/supabase.ts` (`expo-secure-store`), not importable under this
 * suite's plain-`node` Jest environment. What follows replicates
 * `pullChanges.ts`'s own query exactly (read directly before writing this):
 * `supabase.from(table).select('*').eq('org_id', orgId)`, optionally
 * `.gt('updated_at', sinceIso)` — and asserts against the real database the
 * way that query would behave.
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[pullChanges.test.ts] Skipped — EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and set these to actually run this suite ' +
      '(see jest.integration.config.js).',
  );
}

const SYNCED_TABLES = [
  'dispatch_assignments',
  'attendance_records',
  'advances',
  'materials',
  'site_logs',
] as const;

maybeDescribe('pullChanges query contract (Doc 01 §1.9)', () => {
  let fixtures: SyncFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  it("pull is scoped to the active org only — a second org's dispatch_assignments row never appears", async () => {
    const client = await asUser(fixtures.owner);

    // Seed a dispatch_assignments row in the SECOND org (fixtures.otherOrgId)
    // — needs its own worker, since worker_id is not-null/FK'd, but doesn't
    // need to be linked to an auth account for this assertion.
    const { data: otherWorker, error: otherWorkerErr } = await client
      .from('workers')
      .insert({ org_id: fixtures.otherOrgId, full_name: 'Other Org Worker' })
      .select('id')
      .single();
    expect(otherWorkerErr).toBeNull();

    const { error: otherDispatchErr } = await client.from('dispatch_assignments').insert({
      org_id: fixtures.otherOrgId,
      worker_id: otherWorker!.id,
      assignment_date: new Date().toISOString().slice(0, 10),
    });
    expect(otherDispatchErr).toBeNull();

    // pullChanges.ts's exact query shape, scoped to the FIRST org.
    const { data: pulled, error: pullErr } = await client
      .from('dispatch_assignments')
      .select('*')
      .eq('org_id', fixtures.orgId);
    expect(pullErr).toBeNull();

    // The fixture's own seeded row (org A) must be present...
    expect(pulled?.some((row) => row.id === fixtures.dispatchAssignmentId)).toBe(true);
    // ...and every row returned must belong to org A — the second org's row
    // must never appear in a changeset scoped to the first.
    expect(pulled?.every((row) => row.org_id === fixtures.orgId)).toBe(true);
    expect(pulled?.some((row) => row.org_id === fixtures.otherOrgId)).toBe(false);
  });

  it(
    'deleted: [] is accurate for all 5 synced tables — none of them has a ' +
      'deleted_at/tombstone column for pullChanges.ts to populate a deleted ' +
      "bucket from. TODO: this assertion (and pullChanges.ts's own " +
      'hardcoded `deleted: []`) must be revisited the moment a delete path ' +
      '(soft or hard) is ever added to any of these 5 tables — mirroring ' +
      "the disclosure already in pullChanges.ts's own header.",
    async () => {
      const client = await asUser(fixtures.owner);
      for (const table of SYNCED_TABLES) {
        // PostgREST rejects a select on a column that doesn't exist with a
        // 400 ("column ... does not exist") rather than silently ignoring
        // it — the most direct way to confirm the STRUCTURAL fact
        // pullChanges.ts's "no hard-delete path exists" claim rests on,
        // via PostgREST itself rather than assuming information_schema is
        // exposed (it usually isn't, by default, over PostgREST).
        const { error } = await client.from(table).select('deleted_at').limit(1);
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/deleted_at/);
      }
    },
  );
});

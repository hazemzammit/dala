import { randomUUID } from 'node:crypto';

import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type SyncFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/sync/pushChanges.test.ts
 *
 * Doc 02 §2.11's "Offline conflicts" row / Doc 01 §1.9 — the sync engine's
 * push path had zero test coverage before this phase, despite touching
 * money (`advances`) and safety-relevant scheduling (`dispatch_assignments`).
 *
 * SCOPE, disclosed exactly as `./fixtures.ts`'s own header explains: this
 * does NOT import `apps/mobile/src/db/sync/pushChanges.ts` — that file
 * transitively imports `@/lib/supabase.ts` (`expo-secure-store` +
 * `react-native-url-polyfill/auto`), neither available under this suite's
 * plain-`node` Jest environment. What follows instead exercises the exact
 * RPC/table contract `pushChanges.ts`'s own source (read directly before
 * writing this) relies on:
 *   - `pushAdvances()` routes `status: 'pending'` rows through
 *     `request_advance` and `status: 'approved'` rows through
 *     `create_advance`, both passing the row's own `id` as `p_id`.
 *   - `pushSiteLogs()` routes every created row through
 *     `submit_site_log_entry`, `p_idempotency_key` = the row's
 *     `idempotency_key` (or its `id` as a fallback — `resolveIdempotencyKey`).
 *   - `pushDispatchAssignments()` does a conditional
 *     `.update({...}).eq('id', id).eq('version', version)`; zero rows
 *     affected (stale version) is exactly what turns into a
 *     `PendingDispatchConflict` rather than a silent overwrite.
 * One test (the last) does directly assert against `pushChanges.ts`'s own
 * NOT-testable-here claim: the "unexpected local UPDATE to advances/
 * site_logs is rejected/logged" guard is a `console.error` branch inside
 * that file's `pushAdvances`/`pushSiteLogs` functions — client-side only,
 * not enforced by Postgres/RLS (an owner/manager CAN issue a raw UPDATE to
 * either table per their write policies). There is no way to exercise that
 * specific guard without importing the module it lives in, which section
 * above explains isn't possible under this suite's environment. Disclosed
 * here rather than faked with an assertion that doesn't actually cover it —
 * NOT a test in this file, by design.
 *
 * Written and checked against the actual RPC signatures (migration 0047,
 * then 0048) and `pushDispatchAssignments`' real conditional-update logic,
 * but NOT executed against a live instance from this session — no
 * Docker/local Supabase available here. Same disclosed limitation as every
 * other integration suite in this repo.
 *
 * PHASE 21 addition: one more test below covers migration 0048's
 * `p_created_at`/`p_caption` — the two `pushChanges.ts` limitations this
 * repo's own docs disclosed as unfixed since Phase 19. Same RPC-contract
 * approach as every other test here (not importing `pushChanges.ts`
 * itself, for the reason explained above and in `./fixtures.ts`'s header).
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[pushChanges.test.ts] Skipped — EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and set these to actually run this suite ' +
      '(see jest.integration.config.js).',
  );
}

maybeDescribe('pushChanges RPC/table contract (Doc 01 §1.9)', () => {
  let fixtures: SyncFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  it('a locally-created advances row with status "pending" routes through request_advance, and its client id round-trips via p_id', async () => {
    const client = await asUser(fixtures.workerUser);
    const localId = randomUUID();
    const idempotencyKey = randomUUID();

    const { data, error } = await client.rpc('request_advance', {
      p_amount: 40,
      p_reason: 'Avance test push (pending)',
      p_idempotency_key: idempotencyKey,
      p_id: localId,
    });
    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // The whole point of p_id (migration 0047): the server row's id must
    // match the locally-generated id exactly, not a fresh server-generated
    // one — this is the local-id-equals-server-id invariant every model
    // header documents.
    expect((data as { id: string }).id).toBe(localId);
    expect((data as { status: string }).status).toBe('pending');
  });

  it('a locally-created advances row with status "approved" routes through create_advance, and its client id round-trips via p_id', async () => {
    const client = await asUser(fixtures.owner);
    const localId = randomUUID();
    const idempotencyKey = randomUUID();

    const { data, error } = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 60,
      p_reason: 'Avance test push (approved)',
      p_idempotency_key: idempotencyKey,
      p_id: localId,
    });
    expect(error).toBeNull();
    expect((data as { id: string }).id).toBe(localId);
    expect((data as { status: string }).status).toBe('approved');
  });

  it('a locally-created site_logs row routes through submit_site_log_entry with its idempotency key preserved', async () => {
    const client = await asUser(fixtures.workerUser);
    const localId = randomUUID();
    const idempotencyKey = randomUUID();

    const { data, error } = await client.rpc('submit_site_log_entry', {
      p_project_id: fixtures.projectId,
      p_photo_url: null,
      p_voice_note_url: null,
      p_note_text: 'Note test push',
      p_thumbnail_url: null,
      p_location_lat: null,
      p_location_lng: null,
      p_idempotency_key: idempotencyKey,
      p_id: localId,
    });
    expect(error).toBeNull();
    expect((data as { id: string }).id).toBe(localId);

    // "Preserved" means a replay with the SAME key returns the SAME row,
    // per submit_site_log_entry's own idempotency_keys lookup (0020) —
    // the actual hard assertion, not just "the RPC didn't error."
    const replay = await client.rpc('submit_site_log_entry', {
      p_project_id: fixtures.projectId,
      p_photo_url: null,
      p_voice_note_url: null,
      p_note_text: 'Note test push',
      p_thumbnail_url: null,
      p_location_lat: null,
      p_location_lng: null,
      p_idempotency_key: idempotencyKey,
      p_id: randomUUID(), // a genuine push retry would resend the SAME p_id;
      // sending a different one here deliberately, to prove the replay
      // branch returns the ORIGINAL row (and original id), not a new insert
      // using this second id.
    });
    expect(replay.error).toBeNull();
    expect((replay.data as { id: string }).id).toBe(localId);
  });

  it('a dispatch_assignments update with a stale local version affects zero rows — the exact signal pushDispatchAssignments turns into a pending conflict, not a silent overwrite', async () => {
    const client = await asUser(fixtures.owner);

    // Simulate another device/session pushing first: bump the real server
    // version out from under the version this test will pretend is the
    // local device's last-known value.
    const { error: firstUpdateError } = await client
      .from('dispatch_assignments')
      .update({ departure_time: '08:00', version: 2 })
      .eq('id', fixtures.dispatchAssignmentId)
      .eq('version', 1);
    expect(firstUpdateError).toBeNull();

    // Now replay pushDispatchAssignments' own conditional-update pattern
    // with the STALE version (1) a local device that hasn't pulled since
    // would still be carrying.
    const { data: staleAttempt, error: staleError } = await client
      .from('dispatch_assignments')
      .update({ departure_time: '09:00', version: 2 })
      .eq('id', fixtures.dispatchAssignmentId)
      .eq('version', 1) // stale — the real row is now at version 2
      .select('id');
    expect(staleError).toBeNull();
    // Zero rows affected is exactly the condition pushDispatchAssignments'
    // own `if (!data || data.length === 0)` branch checks for, and the
    // ONLY signal it uses to decide "this is a conflict" — no separate
    // version-comparison logic exists client-side.
    expect(staleAttempt).toHaveLength(0);

    // And the row itself must be unchanged by the failed stale attempt —
    // still departure_time '08:00' from the first (successful) update,
    // never '09:00'. This is the "not a silent overwrite" half of the
    // assertion.
    const { data: current, error: readError } = await client
      .from('dispatch_assignments')
      .select('departure_time, version')
      .eq('id', fixtures.dispatchAssignmentId)
      .single();
    expect(readError).toBeNull();
    expect(current?.departure_time).toBe('08:00:00');
    expect(current?.version).toBe(2);
  });

  it('migration 0048: a locally-created site_logs row round-trips its true offline p_created_at and its p_caption through submit_site_log_entry', async () => {
    const client = await asUser(fixtures.workerUser);
    const localId = randomUUID();
    const idempotencyKey = randomUUID();

    // A genuinely offline moment — well before "now" — the exact scenario
    // pushChanges.ts's PHASE 21 header describes: an offline-created row
    // whose true field moment must survive the push, not silently become
    // its server-arrival time.
    const trueCreatedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data, error } = await client.rpc('submit_site_log_entry', {
      p_project_id: fixtures.projectId,
      p_photo_url: null,
      p_voice_note_url: null,
      p_note_text: 'Note test push (0048)',
      p_thumbnail_url: null,
      p_location_lat: null,
      p_location_lng: null,
      p_idempotency_key: idempotencyKey,
      p_id: localId,
      p_created_at: trueCreatedAt,
      p_caption: 'Légende test push (0048)',
    });
    expect(error).toBeNull();
    expect((data as { id: string }).id).toBe(localId);
    // PostgREST serializes timestamptz as "+00:00", not "Z" — same instant,
    // different string, so compare by value rather than exact string match.
    expect(new Date((data as { created_at: string }).created_at).getTime()).toBe(
      new Date(trueCreatedAt).getTime(),
    );
    expect((data as { caption: string | null }).caption).toBe('Légende test push (0048)');
  });

  it('migration 0048: create_advance/request_advance omitting p_created_at still falls back to now(), same as every pre-0048 caller', async () => {
    const client = await asUser(fixtures.owner);
    const localId = randomUUID();
    const idempotencyKey = randomUUID();
    const before = Date.now();

    const { data, error } = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 25,
      p_reason: 'Avance test push (0048, no p_created_at)',
      p_idempotency_key: idempotencyKey,
      p_id: localId,
      // p_created_at deliberately omitted — must default to now(), not
      // error and not null, exactly as migration 0048's own header claims.
    });
    expect(error).toBeNull();
    const after = Date.now();
    const createdAtMs = new Date((data as { created_at: string }).created_at).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before);
    expect(createdAtMs).toBeLessThanOrEqual(after);
  });
});

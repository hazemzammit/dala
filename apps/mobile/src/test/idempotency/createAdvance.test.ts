import { randomUUID } from 'node:crypto';

import {
  asUser,
  createFixtures,
  hasLocalSupabaseEnv,
  teardownFixtures,
  type IdempotencyFixtures,
} from './fixtures';

/**
 * apps/mobile/src/test/idempotency/createAdvance.test.ts
 *
 * Doc 01 §1.11 / Doc 02 §2.11's "Idempotency" row: "Integration test firing
 * the same request twice with the same Idempotency-Key... asserts exactly
 * one financial write occurs, not 'eventually consistent' — a hard
 * assertion."
 *
 * Targets `create_advance` (migration 0019), not `project_expenses` —
 * confirmed by reading the actual mobile code before writing this:
 * `advances.tsx` already wires a real `idempotency_key` through
 * `create_advance`'s RPC call; `expenses.tsx` has NO idempotency wiring at
 * all (no `idempotency_key` reference anywhere in that file). Testing
 * expenses would mean testing a code path that doesn't do idempotency yet,
 * not the one Doc 01 §1.11 is actually describing.
 *
 * `create_advance`'s own replay contract (read directly from 0019, not
 * assumed): a second call with the same key AND the same request hash
 * (org_id|worker_id|amount|reason, md5'd) returns the ORIGINAL row rather
 * than inserting a second one; a second call with the same key but a
 * DIFFERENT payload raises `idempotency_key_reused_with_different_payload`
 * rather than silently processing under the old key. Both branches are
 * covered below — this is a hard assertion against the `advances` table
 * row count, not just "the RPC didn't error twice."
 *
 * Written and checked against the actual `create_advance` signature
 * (p_org_id, p_worker_id, p_amount, p_reason, p_idempotency_key) but NOT
 * executed against a live instance — no Docker/local Supabase available in
 * this session. Same disclosed limitation as the RLS matrix suite.
 */

const maybeDescribe = hasLocalSupabaseEnv() ? describe : describe.skip;

if (!hasLocalSupabaseEnv()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[createAdvance.test.ts] Skipped — EXPO_PUBLIC_SUPABASE_URL / ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY not set. ' +
      'Run `supabase start` and set these to actually run this suite ' +
      '(see jest.integration.config.js).',
  );
}

maybeDescribe('create_advance idempotency (Doc 01 §1.11)', () => {
  let fixtures: IdempotencyFixtures;

  beforeAll(async () => {
    fixtures = await createFixtures();
  }, 30_000);

  afterAll(async () => {
    if (fixtures) await teardownFixtures(fixtures);
  }, 30_000);

  it('firing the same request twice with the same key inserts exactly ONE advances row', async () => {
    const client = await asUser(fixtures.owner);
    const idempotencyKey = randomUUID();

    const first = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 50,
      p_reason: 'Avance test idempotence',
      p_idempotency_key: idempotencyKey,
    });
    expect(first.error).toBeNull();
    expect(first.data).not.toBeNull();
    const firstAdvanceId = (first.data as { id: string }).id;

    // Exact same payload, exact same key — the replay branch.
    const second = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 50,
      p_reason: 'Avance test idempotence',
      p_idempotency_key: idempotencyKey,
    });
    expect(second.error).toBeNull();
    expect(second.data).not.toBeNull();
    const secondAdvanceId = (second.data as { id: string }).id;

    // Both calls must resolve to the SAME advance row — the replay, not a
    // second insert.
    expect(secondAdvanceId).toBe(firstAdvanceId);

    // The hard assertion Doc 02 §2.11 calls for: query the actual table,
    // not just trust that the RPC "didn't error" — count rows for this key.
    const { data: rows, error: countError } = await client
      .from('advances')
      .select('id')
      .eq('worker_id', fixtures.workerId)
      .eq('org_id', fixtures.orgId);
    expect(countError).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it('reusing the same key with a DIFFERENT payload is rejected, not silently processed', async () => {
    const client = await asUser(fixtures.owner);
    const idempotencyKey = randomUUID();

    const first = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 30,
      p_reason: 'Premier montant',
      p_idempotency_key: idempotencyKey,
    });
    expect(first.error).toBeNull();

    // Same key, different amount — must raise, per create_advance's own
    // request_hash comparison (0019), not return a second row or silently
    // reuse the first amount.
    const second = await client.rpc('create_advance', {
      p_org_id: fixtures.orgId,
      p_worker_id: fixtures.workerId,
      p_amount: 999,
      p_reason: 'Montant different',
      p_idempotency_key: idempotencyKey,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toMatch(/idempotency_key_reused_with_different_payload/);

    // Still exactly one row for the original payload — the rejected retry
    // must not have written anything.
    const { data: rows, error: countError } = await client
      .from('advances')
      .select('id, amount')
      .eq('worker_id', fixtures.workerId)
      .eq('org_id', fixtures.orgId)
      .eq('amount', 30);
    expect(countError).toBeNull();
    expect(rows).toHaveLength(1);
  });
});

import { createDispatchConflictResolver } from '@/db/sync/conflictResolver';

/**
 * apps/mobile/src/test/sync/conflictResolver.test.ts
 *
 * Doc 02 §2.11's "Offline conflicts" row / Doc 01 §1.9 / Doc 03 §3.11.
 *
 * UNLIKE `./pushChanges.test.ts` and `./pullChanges.test.ts`,
 * `conflictResolver.ts` has ZERO runtime React Native/Expo imports — its
 * only import is `type { SyncConflictResolver }` from
 * `@nozbe/watermelondb/sync`, a type-only import erased entirely at
 * compile time (confirmed by reading the file's own import line before
 * writing this). That means this suite imports and calls the REAL
 * `createDispatchConflictResolver()` directly — the one sync-engine file
 * in this phase that can be genuinely unit-tested as a TypeScript module,
 * not just tested at the RPC/table level like the other two.
 *
 * Needs no Supabase instance at all — this is a pure function over plain
 * objects. Still lives under `src/test/sync/` for consistency with the
 * other two sync suites and to keep `test:rls`'s widened testMatch glob
 * (`src/test/sync/**\/*.test.ts`) simple, but does NOT use the
 * `hasLocalSupabaseEnv()` skip-guard the other two suites need — there is
 * nothing here that needs a local Supabase instance to run, and gating it
 * behind that check would make it silently skip in exactly the
 * environment (no Docker) where a genuinely-executable test would be most
 * valuable. This is disclosed here rather than left as an unexplained
 * inconsistency with its two sibling files.
 *
 * PHASE 20 — actually run in this session (unlike every other suite this
 * phase touches): `pnpm jest --config jest.integration.config.js
 * src/test/sync/conflictResolver.test.ts` was executed against the real
 * compiled module, no live Supabase needed. Result reported in the
 * delivery notes' Live-verified section — this is the one item in the
 * whole delivery genuinely live-verified, not just implemented.
 */

describe('createDispatchConflictResolver (Doc 01 §1.9 / Doc 03 §3.11)', () => {
  it('a dispatch_assignments row with no local changes and a matching version returns the library default unchanged', () => {
    const { resolver, pendingConflicts } = createDispatchConflictResolver();

    const local = {
      id: 'da-1',
      _status: 'synced',
      _changed: '',
      version: 3,
      departure_time: '07:00',
    };
    const remote = { id: 'da-1', version: 3, departure_time: '07:00' };
    const resolved = { id: 'da-1', version: 3, departure_time: '07:00' };

    const result = resolver('dispatch_assignments', local, remote, resolved);

    expect(result).toBe(resolved);
    expect(pendingConflicts).toHaveLength(0);
  });

  it('a row with local changes and a version mismatch pushes a PendingDispatchConflict with only the changed, non-meta fields and the remote version, and returns remote (server wins in the synced table)', () => {
    const { resolver, pendingConflicts } = createDispatchConflictResolver();

    const local = {
      id: 'da-2',
      _status: 'updated',
      _changed: 'departure_time,vehicle_id,version',
      version: 3, // this device's stale last-known version
      departure_time: '09:00',
      vehicle_id: 'vehicle-local',
      worker_id: 'worker-unchanged',
    };
    const remote = {
      id: 'da-2',
      version: 5, // someone else pushed twice since this device last synced
      departure_time: '08:00',
      vehicle_id: 'vehicle-server',
      worker_id: 'worker-unchanged',
    };
    const resolved = {
      // WatermelonDB's own default — every locally-dirty column already
      // overwritten in, per its per-column client-wins default.
      id: 'da-2',
      version: 3,
      departure_time: '09:00',
      vehicle_id: 'vehicle-local',
      worker_id: 'worker-unchanged',
    };

    const result = resolver('dispatch_assignments', local, remote, resolved);

    // Server wins in the synced table — NOT `resolved` (which would let
    // the local edit silently overwrite).
    expect(result).toBe(remote);

    expect(pendingConflicts).toHaveLength(1);
    expect(pendingConflicts[0].dispatchAssignmentId).toBe('da-2');
    expect(pendingConflicts[0].serverVersionAtConflict).toBe(5);

    // Only the ACTUALLY-changed, non-meta fields — `_changed` lists
    // 'departure_time,vehicle_id,version'; 'version' is in
    // NON_MERGEABLE_KEYS and must be excluded. 'worker_id' was never in
    // `_changed` and must NOT appear even though it exists on `local`.
    const snapshot = JSON.parse(pendingConflicts[0].localSnapshot);
    expect(snapshot).toEqual({
      departure_time: '09:00',
      vehicle_id: 'vehicle-local',
    });
    expect(Object.keys(snapshot)).not.toContain('worker_id');
    expect(Object.keys(snapshot)).not.toContain('version');
  });

  it('the 4 append-only tables never produce a pending conflict regardless of input, and always return resolved unchanged', () => {
    const { resolver, pendingConflicts } = createDispatchConflictResolver();
    const appendOnlyTables = ['attendance_records', 'advances', 'materials', 'site_logs'];

    for (const table of appendOnlyTables) {
      const local = { id: `${table}-1`, _status: 'updated', _changed: 'amount', version: 1 };
      const remote = { id: `${table}-1`, version: 99 };
      const resolved = { id: `${table}-1`, version: 1, amount: 500 };

      const result = resolver(table, local, remote, resolved);
      expect(result).toBe(resolved);
    }

    expect(pendingConflicts).toHaveLength(0);
  });

  it('a local record marked deleted for dispatch_assignments is a safe no-op — returns resolved, no pending conflict (no delete path exists for this table, but the resolver still special-cases it defensively)', () => {
    const { resolver, pendingConflicts } = createDispatchConflictResolver();

    const local = { id: 'da-3', _status: 'deleted', _changed: '', version: 1 };
    const remote = { id: 'da-3', version: 2 };
    const resolved = { id: 'da-3', version: 1 };

    const result = resolver('dispatch_assignments', local, remote, resolved);

    expect(result).toBe(resolved);
    expect(pendingConflicts).toHaveLength(0);
  });

  it('two separate synchronize() calls get two separate pendingConflicts arrays — no leakage between calls', () => {
    const first = createDispatchConflictResolver();
    first.resolver(
      'dispatch_assignments',
      { id: 'da-4', _status: 'updated', _changed: 'departure_time', version: 1 },
      { id: 'da-4', version: 2 },
      { id: 'da-4', version: 1, departure_time: '10:00' },
    );
    expect(first.pendingConflicts).toHaveLength(1);

    const second = createDispatchConflictResolver();
    expect(second.pendingConflicts).toHaveLength(0);
    expect(second.pendingConflicts).not.toBe(first.pendingConflicts);
  });
});

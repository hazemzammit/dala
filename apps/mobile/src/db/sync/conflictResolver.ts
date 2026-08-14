import type { SyncConflictResolver } from '@nozbe/watermelondb/sync';

/**
 * apps/mobile/src/db/sync/conflictResolver.ts
 *
 * PHASE 18 REDO — this file previously implemented automatic field-level
 * last-write-wins merging (a `field_versions` timestamp map, per-field),
 * built against a stale docx snapshot of the cahier des charges rather
 * than this repo's own living spec in `docs/spec/` (confirmed
 * authoritative — docx is older). The real design, read directly from
 * `docs/spec/01-data-model-security-and-architecture.md` §1.9 and
 * `docs/spec/03-screens-mobile-contractor-and-worker.md` §3.11:
 *
 *   - `attendance_records`, `advances`, `materials`, `site_logs` are
 *     append-only for offline writes — no conflict to resolve, by
 *     construction. This resolver does nothing special for them; returns
 *     `resolved` exactly as WatermelonDB's own default computed it.
 *   - `dispatch_assignments` is the one genuinely editable-record table
 *     among these 5, and needs optimistic concurrency (the `version`
 *     column, migration 0006) with conflicts surfaced to the user
 *     EXPLICITLY: "This is the one place in the app where an automatic
 *     merge is deliberately avoided — a wrong automatic guess here means
 *     the wrong worker gets sent to the wrong site." (Doc 03 §3.11, verbatim)
 *
 * WatermelonDB's OWN default conflict resolution (`resolveConflict` in the
 * installed package's `src/sync/impl/helpers.js`, read directly) is
 * per-column client-wins: any locally-dirty column overwrites whatever the
 * pull just brought down, unconditionally. That default is exactly the
 * "automatic merge" the dispatch-board spec text says to avoid — so for
 * `dispatch_assignments` specifically, this resolver actively REVERSES it
 * when a genuine conflict is detected (see `hasVersionConflict` below),
 * rather than only refining it the way the previous field-level resolver
 * did.
 *
 * SYNCHRONOUS CONSTRAINT: `SyncConflictResolver` returns `DirtyRaw`
 * directly, not a `Promise` (confirmed from `sync/index.d.ts`) — this
 * function CANNOT perform an async `database.write()` to persist a
 * detected conflict into `dispatch_assignment_conflicts` while sync is
 * still running. Conflicts are instead collected into an in-memory array
 * for the duration of one `synchronize()` call (via
 * `createDispatchConflictResolver()`'s closure) and flushed to the local
 * table by `runSync()` in `sync/index.ts` AFTER `synchronize()` resolves —
 * see that file for the write-side of this split.
 */

export interface PendingDispatchConflict {
  dispatchAssignmentId: string;
  /** JSON-encoded `{ [column]: localValue }` — every field the user had changed. */
  localSnapshot: string;
  serverVersionAtConflict: number;
}

const DISPATCH_ASSIGNMENTS_TABLE = 'dispatch_assignments';
const NON_MERGEABLE_KEYS = new Set(['id', 'version', '_status', '_changed']);

/**
 * A fresh resolver + its pending-conflicts sink, scoped to one
 * `synchronize()` call — `runSync()` creates one of these per sync run
 * rather than sharing a module-level singleton, so conflicts from one
 * sync can't leak into the next if two syncs somehow overlap (shouldn't
 * happen given `runSync()`'s own in-flight coalescing, but scoping this
 * per-call costs nothing and removes the question entirely).
 */
export function createDispatchConflictResolver(): {
  resolver: SyncConflictResolver;
  pendingConflicts: PendingDispatchConflict[];
} {
  const pendingConflicts: PendingDispatchConflict[] = [];

  const resolver: SyncConflictResolver = (table, local, remote, resolved) => {
    if (table !== DISPATCH_ASSIGNMENTS_TABLE) {
      // The 4 append-only tables: nothing to do. WatermelonDB's own
      // default (`resolved`, computed before this function is called)
      // already handles the only case that can realistically arise for
      // them — a local record whose push hasn't landed yet, pulled back
      // unchanged.
      return resolved;
    }

    if (local._status === 'deleted') {
      // No dispatch_assignments delete path exists anywhere in this app
      // (confirmed by the same repo-wide grep pullChanges.ts's header
      // describes) — included only because WatermelonDB's own
      // resolveConflict special-cases it, and returning `resolved`
      // unchanged here is the safe no-op either way.
      return resolved;
    }

    const localChangedCols =
      typeof local._changed === 'string' && local._changed !== '' ? local._changed.split(',') : [];

    const localVersion = typeof local.version === 'number' ? local.version : null;
    const remoteVersion = typeof remote.version === 'number' ? remote.version : null;

    const hasVersionConflict =
      localChangedCols.length > 0 &&
      localVersion !== null &&
      remoteVersion !== null &&
      remoteVersion !== localVersion;

    if (!hasVersionConflict) {
      // Either nothing was changed locally, or this device's last-known
      // version still matches the server's — no one else edited this row
      // since this device last synced, so the normal (local-wins-on-
      // dirty-columns) default is exactly correct, not a merge to avoid.
      return resolved;
    }

    // Genuine conflict: someone else's edit reached the server first.
    // Per Doc 03 §3.11, do NOT let the local edit silently win (the
    // library's default `resolved` currently would, since every changed
    // column is dirty) — capture the ENTIRE local edit as one unit for
    // the compare-sheet, and let the synced row itself settle to the
    // server's value so sync completes in a consistent state.
    const localSnapshot: Record<string, unknown> = {};
    for (const col of localChangedCols) {
      if (!NON_MERGEABLE_KEYS.has(col)) {
        localSnapshot[col] = local[col];
      }
    }

    pendingConflicts.push({
      dispatchAssignmentId: local.id,
      localSnapshot: JSON.stringify(localSnapshot),
      serverVersionAtConflict: remoteVersion,
    });

    // Server wins in the actual synced table; the user's local edit lives
    // on only in `pendingConflicts` until Phase 19's compare-sheet UI
    // resolves it.
    return remote;
  };

  return { resolver, pendingConflicts };
}

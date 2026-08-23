import { Q } from '@nozbe/watermelondb';
import { synchronize } from '@nozbe/watermelondb/sync';
import * as Sentry from '@sentry/react-native';

import { database } from '../index';
import DispatchAssignmentConflict from '../models/DispatchAssignmentConflict';

import { createDispatchConflictResolver, type PendingDispatchConflict } from './conflictResolver';
import { pullChanges } from './pullChanges';
import { createPushChanges } from './pushChanges';

import { markSyncFinished, markSyncStarted } from '@/lib/syncStatus';

/**
 * apps/mobile/src/db/sync/index.ts
 *
 * Doc 03 §3.3/§3.9 offline-first sync — Phase 18. The single call site
 * every trigger point (app foreground, network reconnect, a manual "sync
 * now" affordance) should use — none of them should call `synchronize()`
 * directly, so the conflict-resolution strategy and error handling stay in
 * one place.
 *
 * FIXED HERE: this file had been overwritten with a stale, pre-Phase-1
 * copy of itself (missing the markSyncStarted/markSyncFinished wiring
 * below), while the actual up-to-date version of this same content had
 * been mistakenly written to `db/index.ts` instead — clobbering that
 * file's real Database/adapter setup. See `db/index.ts`'s own header for
 * the full story; this file's content is that misplaced copy, restored to
 * its correct path.
 *
 * PHASE 18 REDO — `conflictResolver`/`pushChanges` are now factory
 * functions, not static imports, both closing over the SAME
 * `pendingConflicts` array for one sync run (Doc 01 §1.9's real
 * optimistic-concurrency design needs conflicts detected during BOTH the
 * pull-time resolver and, as a rare backstop, push-time version-check
 * failures — see conflictResolver.ts/pushChanges.ts's own headers for why
 * each can independently discover one). `runSync()` flushes that shared
 * array into the local `dispatch_assignment_conflicts` table AFTER
 * `synchronize()` resolves — `SyncConflictResolver` is synchronous and
 * can't do this itself (see conflictResolver.ts's header).
 *
 * `sendCreatedAsUpdated: true` — required by pullChanges.ts's own
 * deliberate design (see its header): every changed row is put in the
 * `updated` bucket there, never `created`, because WatermelonDB's actual
 * create-vs-update decision at apply time is made by local-id lookup, not
 * by which bucket a raw arrived on. That's still correct behavior without
 * this flag — but without it, WatermelonDB additionally logs a
 * `diagnosticError` ("Server wants client to update record X, but it
 * doesn't exist locally... This could be a serious bug") every single
 * time an `updated` row turns out to be new to this device, which is the
 * common case on a first sync or a new device. It recovers by creating
 * the record anyway either way — the flag only tells WatermelonDB this is
 * expected, so it stops logging it as an error. This is exactly the flag
 * the diagnostic message itself points at.
 *
 * PHASE 1 (improvement-plan §5.2) — `markSyncStarted()`/`markSyncFinished()`
 * added around the existing try/catch/finally below, reporting into
 * `lib/syncStatus.ts`'s external store. This is purely additive: the
 * function's signature, return type, and every existing behavior
 * (coalescing, conflict flushing, Sentry reporting) are unchanged. See
 * syncStatus.ts's header for why this is done here rather than in each of
 * the ~10 `void runSync()` call sites across the app.
 */
export interface SyncResult {
  ok: boolean;
  error?: Error;
  conflictCount: number;
}

let syncInFlight: Promise<SyncResult> | null = null;

async function flushPendingConflicts(pendingConflicts: PendingDispatchConflict[]): Promise<void> {
  if (pendingConflicts.length === 0) return;

  const conflictsCollection = database.get<DispatchAssignmentConflict>(
    'dispatch_assignment_conflicts',
  );

  await database.write(async () => {
    for (const conflict of pendingConflicts) {
      // Upsert-by-dispatchAssignmentId: if this same row conflicted again
      // on a later sync before the user resolved the earlier one, refresh
      // the existing local record rather than piling up duplicate
      // conflict entries for the same dispatch assignment.
      const existing = await conflictsCollection
        .query(Q.where('dispatch_assignment_id', conflict.dispatchAssignmentId))
        .fetch();

      if (existing.length > 0) {
        await existing[0].update((record) => {
          record.localSnapshot = conflict.localSnapshot;
          record.serverVersionAtConflict = conflict.serverVersionAtConflict;
          record.detectedAt = new Date();
        });
      } else {
        await conflictsCollection.create((record) => {
          record.dispatchAssignmentId = conflict.dispatchAssignmentId;
          record.localSnapshot = conflict.localSnapshot;
          record.serverVersionAtConflict = conflict.serverVersionAtConflict;
          record.detectedAt = new Date();
        });
      }
    }
  });
}

export async function runSync(): Promise<SyncResult> {
  // Coalesce concurrent callers (e.g. a foreground event and a reconnect
  // event firing within the same second) into a single in-flight sync
  // rather than running `synchronize()` twice against the same local DB —
  // WatermelonDB's own docs note sync is for "the entire database at once,
  // not per-collection," so overlapping calls would race, not merely
  // duplicate work.
  //
  // Deliberately NOT calling markSyncStarted() when we return the shared
  // in-flight promise below — the store was already moved to 'syncing' by
  // whichever call started it, and coalesced callers cause no new,
  // observable state transition.
  if (syncInFlight) {
    return syncInFlight;
  }

  markSyncStarted();

  syncInFlight = (async (): Promise<SyncResult> => {
    const { resolver, pendingConflicts } = createDispatchConflictResolver();
    const pushChanges = createPushChanges(pendingConflicts);

    try {
      await synchronize({
        database,
        pullChanges,
        pushChanges,
        conflictResolver: resolver,
        sendCreatedAsUpdated: true,
      });

      await flushPendingConflicts(pendingConflicts);

      const result: SyncResult = { ok: true, conflictCount: pendingConflicts.length };
      markSyncFinished(result);
      return result;
    } catch (rawError) {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError));
      // eslint-disable-next-line no-console
      console.error('[sync] failed', error);
      Sentry.captureException(error, { tags: { feature: 'offline_sync' } });
      const result: SyncResult = { ok: false, error, conflictCount: pendingConflicts.length };
      markSyncFinished(result);
      return result;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

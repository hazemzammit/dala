import { Q } from '@nozbe/watermelondb';
import { synchronize } from '@nozbe/watermelondb/sync';
import * as Sentry from '@sentry/react-native';

import { database } from '../index';
import DispatchAssignmentConflict from '../models/DispatchAssignmentConflict';

import { createDispatchConflictResolver, type PendingDispatchConflict } from './conflictResolver';
import { pullChanges } from './pullChanges';
import { createPushChanges } from './pushChanges';

/**
 * apps/mobile/src/db/sync/index.ts
 *
 * Doc 03 §3.3/§3.9 offline-first sync — Phase 18. The single call site
 * every trigger point (app foreground, network reconnect, a manual "sync
 * now" affordance) should use — none of them should call `synchronize()`
 * directly, so the conflict-resolution strategy and error handling stay in
 * one place.
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
  if (syncInFlight) {
    return syncInFlight;
  }

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

      return { ok: true, conflictCount: pendingConflicts.length };
    } catch (rawError) {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError));
      // eslint-disable-next-line no-console
      console.error('[sync] failed', error);
      Sentry.captureException(error, { tags: { feature: 'offline_sync' } });
      return { ok: false, error, conflictCount: pendingConflicts.length };
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

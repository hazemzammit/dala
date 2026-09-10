import { useEffect, useState, useSyncExternalStore } from 'react';

import { getSyncStatusSnapshot, subscribeSyncStatus } from '@/lib/syncStatus';

/**
 * apps/mobile/src/lib/useMutationSyncState.ts
 *
 * Doc 05 §1.7p — the offline mutation state machine (Draft → Saving
 * locally → Saved locally → Syncing → Synced, + Sync-failed/Retry) for a
 * SPECIFIC action, kept visibly distinct from `OfflineBanner`'s global
 * network/sync indicator (§1.7p is explicit these must not be conflated).
 * First applied to Worker Home's check-in (Phase 19C) — the spec's
 * highest-priority gap here, and independently corroborated: syncStatus.ts's
 * own header comment (an earlier "improvement-plan §5.2" phase) already
 * lists `worker/home.tsx` by name among the fire-and-forget call sites it
 * deliberately did NOT fix, since that phase was scoped elsewhere.
 *
 * IMPLEMENTATION CHOICE: this does not track the specific local record's
 * own WatermelonDB sync flag — it reuses the existing GLOBAL `syncStatus`
 * store (the same one `OfflineBanner` reads) as a proxy, starting the
 * moment THIS action's own `void runSync()` call fires. In this app's
 * actual sync architecture, a `runSync()` call pushes ALL locally-dirty
 * records in one batch, so watching the phase transitions that begin
 * right after this action's write is, in practice, an accurate read of
 * "did MY action's data reach the server" — reusing the already-built,
 * already-tested store rather than adding a second, per-record
 * WatermelonDB observation layer for a distinction that wouldn't be
 * visible to the person using the screen anyway. The one theoretical gap:
 * if an unrelated sync elsewhere completes in the same window, this could
 * report "synced" a beat early — a minor cosmetic inaccuracy, not a
 * "the user believes it saved but it didn't" failure, which is the actual
 * trust problem this state machine exists to prevent.
 */
export type MutationSyncState = 'idle' | 'saving' | 'saved' | 'syncing' | 'synced' | 'sync-failed';

export function useMutationSyncState() {
  const [state, setState] = useState<MutationSyncState>('idle');
  const syncStatus = useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot);

  useEffect(() => {
    // Only mirror the global phase once this specific action has actually
    // started tracking (past "saving") — otherwise an unrelated sync
    // elsewhere would flash this indicator before the person has done
    // anything on this screen at all.
    setState((current) => {
      if (current === 'idle' || current === 'saving') return current;
      if (syncStatus.phase === 'syncing') return 'syncing';
      if (syncStatus.phase === 'success') return 'synced';
      if (syncStatus.phase === 'error') return 'sync-failed';
      return current;
    });
  }, [syncStatus.phase]);

  return {
    state,
    /** Call the instant the local write starts. */
    startSaving: () => setState('saving'),
    /** Call the instant the local write resolves — before `runSync()`
     * fires, so "Saved locally" is genuinely visible even for the brief
     * window before a sync attempt begins. */
    markSavedLocally: () => setState('saved'),
    /** Call on a local-write failure (distinct from a sync failure —
     * this never even reached the sync step). */
    reset: () => setState('idle'),
  };
}

import type { SyncResult } from '@/db/sync';

/**
 * apps/mobile/src/lib/syncStatus.ts
 *
 * PHASE 1 (improvement-plan §5.2) — `pointage.tsx`'s `handleSave()` and
 * `AutoSync.tsx` both fire `void runSync()` and discard the result.
 * `db/sync/index.ts` already catches a sync failure and reports it to
 * Sentry, but the calling screen never learns the outcome, so a contractor
 * can believe their data synced when it silently didn't.
 *
 * FIX SHAPE, deliberately chosen over threading a callback through every
 * `void runSync()` call site: `runSync()` itself (see db/sync/index.ts)
 * now reports its own start/finish into this tiny external store, wrapped
 * around its existing try/catch/finally rather than changing its return
 * contract. That means every existing call site — `pointage.tsx`,
 * `AutoSync.tsx`, and the other ~8 fire-and-forget call sites this phase
 * was NOT scoped to touch (dispatch.tsx, worker/home.tsx,
 * advance-request.tsx, material-request.tsx, update-chantier.tsx,
 * DispatchConflictsSheet.tsx, dashboard.tsx) — becomes visible through the
 * same banner for free, with zero per-screen wiring. This is the same
 * "single point of fix" reasoning `app/_layout.tsx`'s own header already
 * uses for safe-area insets: fix it once where every call funnels through,
 * not once per caller.
 *
 * Plain module-level state + a subscriber Set, read via React's
 * `useSyncExternalStore` (React 19, no extra dependency) — this app has no
 * global state library (no zustand/jotai in package.json), and a single
 * small, rarely-updated value doesn't justify adding one.
 */
export type SyncPhase = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncStatusState {
  phase: SyncPhase;
  /** Human-readable message for the last failure, for the banner's
   *  tap-for-detail. Cleared on the next successful sync. */
  lastError: string | null;
  lastSyncedAt: number | null;
  /** Surfaced so a future phase (§9.3, explicitly out of scope here) can
   *  point the user at DispatchConflictsSheet without re-deriving this. */
  conflictCount: number;
}

let state: SyncStatusState = {
  phase: 'idle',
  lastError: null,
  lastSyncedAt: null,
  conflictCount: 0,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncStatusSnapshot(): SyncStatusState {
  return state;
}

/** Called by `runSync()` the instant a sync run actually starts (after the
 * in-flight coalescing check), never by screen code directly. */
export function markSyncStarted(): void {
  state = { ...state, phase: 'syncing' };
  emit();
}

/** Called by `runSync()` in its `finally`-adjacent resolution, with the
 * exact `SyncResult` it's about to return — single source of truth, no
 * chance of the banner and the caller disagreeing about what happened. */
export function markSyncFinished(result: SyncResult): void {
  if (result.ok) {
    state = {
      phase: 'success',
      lastError: null,
      lastSyncedAt: Date.now(),
      conflictCount: result.conflictCount,
    };
  } else {
    state = {
      phase: 'error',
      lastError: result.error?.message ?? 'Erreur de synchronisation inconnue.',
      lastSyncedAt: state.lastSyncedAt,
      conflictCount: result.conflictCount,
    };
  }
  emit();
}

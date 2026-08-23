/**
 * apps/mobile/src/lib/errorStatus.ts
 *
 * Phase 12 (improvement-plan §10.3). Same external-store shape as
 * `syncStatus.ts` (a module-level value + subscriber set + `useSyncExternalStore`
 * hook) — not a new state-management pattern, reusing the one this
 * codebase already established for exactly this kind of "fires outside
 * React, a component somewhere needs to react to it" signal.
 *
 * Deliberately narrow: this store only ever holds the LATEST uncaught
 * error, not a queue/history. A toast is transient by nature (Toast.tsx's
 * own `ToastProvider` auto-dismisses); there is no UI here that would ever
 * show more than the most recent one, so a queue would be complexity with
 * no consumer.
 */
export interface FatalErrorEvent {
  message: string;
  /** Monotonically increasing so a repeated identical error still
   *  triggers a new toast — a plain object-equality check on message
   *  alone would silently swallow a second occurrence of the same error. */
  id: number;
}

let current: FatalErrorEvent | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

/**
 * Called from exactly two places, both deliberately OUTSIDE the normal
 * `toast.error(...)` call sites that already handle their own expected
 * failures: `ErrorBoundary.tsx` (a render crash) and `sentry.ts`'s
 * `beforeSend` hook (an uncaught JS error/promise rejection Sentry's SDK
 * itself intercepts). Anything already shown via an existing
 * `toast.error(...)` call is, by definition, not uncaught — it never
 * reaches either of those two places, so it can never double-fire this
 * store. That's structural, not a filter this file has to implement.
 */
export function reportFatalError(message: string): void {
  current = { message, id: nextId++ };
  listeners.forEach((listener) => listener());
}

export function subscribeFatalError(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFatalErrorSnapshot(): FatalErrorEvent | null {
  return current;
}

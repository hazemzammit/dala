import * as Sentry from '@sentry/react-native';

import { reportFatalError } from './errorStatus';

/**
 * apps/mobile/src/lib/sentry.ts
 *
 * Phase 12 (improvement-plan §10.3). FINDING, stated plainly rather than
 * silently fixed: before this file existed, `Sentry.captureException` was
 * already being called from two places (`db/index.ts` — now
 * `db/sync/index.ts`, see that file's own Phase 12 fix note — and, as of
 * this phase, `ErrorBoundary.tsx`), but `Sentry.init()` was never called
 * ANYWHERE in the app. Per the SDK's own documented behavior, every
 * `captureException`/`captureMessage` call before `init()` is a silent
 * no-op — it does not throw, does not queue, does not warn. So the gap
 * this phase was scoped to close ("Sentry captures errors but they don't
 * reach the user") was, on inspection, one layer more foundational: prior
 * to this phase, NOTHING was reaching Sentry's backend either. Confirmed
 * by grepping the entire `apps/mobile` tree for `Sentry.init` before
 * writing this file — zero matches; `@sentry/react-native` was a
 * dependency and a config-plugin entry in `app.json` (source-map
 * upload/native symbolication only — that plugin does not call `init()`
 * on your behalf) with no runtime initialization anywhere.
 *
 * `dsn` read from `EXPO_PUBLIC_SENTRY_DSN`, matching this codebase's own
 * `EXPO_PUBLIC_*` convention for client-visible env vars (`lib/supabase.ts`).
 * `initSentry()` no-ops (logs once, doesn't throw) when the DSN is unset —
 * so a dev/preview build without a configured DSN still runs normally
 * instead of crashing at startup; this mirrors `lib/appVersion.ts`'s own
 * "fail open, never block a legitimate user" posture for infrastructure
 * that isn't always configured in every environment.
 *
 * KNOWN LIMITATION, disclosed rather than silently accepted: `initSentry()`
 * is called at the top of `_layout.tsx`'s module scope (see that file),
 * which is the earliest point in this app's OWN code that runs — but
 * Expo Router's `expo-router/entry` bootstraps before any route module
 * (including `_layout.tsx`) loads. A crash during that bootstrap window
 * (before this file's `init()` call executes) will not be captured. This
 * is a real, standing gap — closing it fully requires either an
 * `index.js` entry file that calls `Sentry.init()` before importing
 * `expo-router/entry` (a structural change to how the app boots, flagged
 * here rather than made silently) or accepting Sentry's own native crash
 * handler (which the SDK installs at the native layer regardless of JS
 * init timing, and DOES cover this window for native/native-crash
 * scenarios — only a JS-level crash in that narrow bootstrap window is
 * the actual uncovered case). Flagged in PHASE_12_BRIEF.md as a follow-up,
 * not fixed here, to keep this phase's change to the root layout a single,
 * reviewable diff rather than restructuring the app's entry point.
 */
let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN not set — error reporting disabled this run.');
    return;
  }

  Sentry.init({
    dsn,
    // Errors are already routed through this app's own try/catch +
    // toast.error(...) call sites for every EXPECTED failure (network
    // errors, validation errors, RPC errors) — those are not sent here at
    // all, by construction: this init only affects captureException calls
    // and the SDK's own automatic uncaught-error/unhandled-rejection
    // interception, neither of which those existing call sites go
    // through. tracesSampleRate is deliberately low/off rather than
    // tuned — this phase's scope is error visibility, not performance
    // monitoring; revisit if/when performance tracing is actually wanted.
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      // Surface every event that reaches this hook to the user as a
      // generic toast — see errorStatus.ts's header for why this can
      // never double-fire an already-toasted expected error (structural,
      // not a filter here): anything already shown via an existing
      // `toast.error(...)` call never calls Sentry.captureException, so
      // it never reaches beforeSend in the first place.
      const message =
        hint?.originalException instanceof Error
          ? hint.originalException.message
          : 'Une erreur inattendue est survenue.';
      reportFatalError(message);
      return event;
    },
  });
}

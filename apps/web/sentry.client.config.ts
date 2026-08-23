import * as Sentry from '@sentry/nextjs';

/**
 * apps/web/sentry.client.config.ts
 *
 * IMPROVEMENT-PLAN §10.3 (delivered as "Phase 12" — see
 * docs/PHASE_12_BRIEF.md §0/§2 for the full disclosure of why this
 * bucket isn't a numbered plan phase). FINDING: `@sentry/nextjs` was
 * already a real dependency in `package.json` (`^8.34.0`) but was never
 * initialized anywhere in this app — confirmed by grepping for
 * `Sentry.init`/`@sentry` across `apps/web/src` before writing this.
 * Same gap, same fix shape, as `apps/mobile/src/lib/sentry.ts` (this
 * same phase) — see that file's own header for the fuller version of
 * this reasoning; not repeated here.
 *
 * FILE NAMING: `sentry.client.config.ts` (not the newer
 * `instrumentation-client.ts` Sentry's current docs describe) —
 * deliberately, because this repo is pinned to `@sentry/nextjs ^8.34.0`,
 * and the `instrumentation-client.ts` convention is a v9+ convention
 * confirmed via Sentry's own current setup docs. Using the wrong
 * convention for the actually-installed major version would silently
 * not run at all. A future upgrade to Sentry v9 should migrate this
 * file's contents into `instrumentation-client.ts` per Sentry's
 * then-current docs — flagged here so that migration isn't missed.
 *
 * DSN via `NEXT_PUBLIC_SENTRY_DSN` — same "undefined is a safe no-op"
 * property Sentry's SDK documents for every platform, same reasoning as
 * the mobile file. No `tracesSampleRate`/Session Replay — same "errors
 * only, not a broader observability buildout" scope as mobile.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  debug: process.env.NODE_ENV === 'development',
});

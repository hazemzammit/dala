/**
 * apps/admin/instrumentation.ts
 *
 * IMPROVEMENT-PLAN §10.3 (delivered as "Phase 12"). Next.js's own
 * `register()` hook — this file did not exist before this phase
 * (confirmed by checking before writing it), so
 * `sentry.server.config.ts`/`sentry.edge.config.ts` (this same phase)
 * were never actually loaded even once written, without this file
 * importing them. `sentry.client.config.ts` doesn't need registering
 * here — Next.js loads that one automatically by its filename alone.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

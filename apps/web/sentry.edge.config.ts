import * as Sentry from '@sentry/nextjs';

/**
 * apps/web/sentry.edge.config.ts — covers any Middleware/edge-runtime Route
 * Handlers, distinct from `sentry.server.config.ts`'s Node.js runtime.
 * Same reasoning as that file — see `sentry.client.config.ts`'s header for
 * the full write-up, not repeated three times.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  debug: process.env.NODE_ENV === 'development',
});

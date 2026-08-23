import * as Sentry from '@sentry/nextjs';

/**
 * apps/web/sentry.server.config.ts — server-side counterpart to
 * `sentry.client.config.ts` (this same phase, see that file's header for
 * the full reasoning). Covers Server Components, Route Handlers, and
 * Server Actions running in the Node.js runtime.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  debug: process.env.NODE_ENV === 'development',
});

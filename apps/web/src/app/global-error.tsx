'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * apps/web/src/app/global-error.tsx
 *
 * IMPROVEMENT-PLAN §10.3 (delivered as "Phase 12"). Next.js App Router
 * doesn't automatically report a `global-error.tsx` crash to Sentry —
 * this file's own `useEffect` capture is the documented way to wire it
 * up, matching the mobile app's `ErrorBoundary.tsx` in spirit (same
 * phase): reaching the user with something better than a blank crashed
 * page AND actually reporting the error, which — see this phase's own
 * finding in `sentry.client.config.ts`'s header — wasn't happening for
 * either app before this phase.
 *
 * `global-error.tsx` replaces the ENTIRE root layout on a crash (Next.js's
 * own documented behavior), so it must render its own `<html>`/`<body>` —
 * it can't rely on `app/layout.tsx` still being present.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="bg-neutral-25 text-neutral-900 antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
          <p className="max-w-sm text-sm text-neutral-500">
            L&apos;application a rencontré un problème inattendu. Rechargez la page pour continuer.
          </p>
        </div>
      </body>
    </html>
  );
}

'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * apps/admin/src/app/global-error.tsx — same reasoning as
 * apps/web/src/app/global-error.tsx (this same phase); not repeated here.
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
      <body className="bg-neutral-25 text-neutral-900">
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

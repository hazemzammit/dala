'use client';

import { Card } from '@dala/ui-web';
import { useSearchParams } from 'next/navigation';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message');

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Lien invalide ou expiré
        </h1>
        <p className="mt-3 text-sm text-neutral-500">
          {message ?? 'Ce lien a expiré ou a déjà été utilisé.'}
        </p>
        <a
          href="/forgot-password"
          className="text-accent-600 mt-6 inline-block text-sm font-medium underline"
        >
          Demander un nouveau lien
        </a>
      </Card>
    </main>
  );
}

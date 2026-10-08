'use client';

import { Card } from '@dala/ui-web';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import logo from '../../../../assets/logo.png';

// useSearchParams() must sit under a Suspense boundary (a hard build error in
// Next 15 for statically rendered pages), so the page is a thin shell.
export default function AuthErrorPage() {
  return (
    <Suspense fallback={<AuthErrorShell message={null} />}>
      <AuthErrorWithMessage />
    </Suspense>
  );
}

function AuthErrorWithMessage() {
  const searchParams = useSearchParams();
  return <AuthErrorShell message={searchParams.get('message')} />;
}

function AuthErrorShell({ message }: { message: string | null }) {
  return (
    <main className="bg-neutral-25 relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="bg-danger/10 pointer-events-none absolute -end-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
      <Card className="relative z-10 w-full max-w-sm p-8 text-center">
        <Image src={logo} alt="Dala" className="mx-auto mb-6 h-8 w-auto" priority />
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

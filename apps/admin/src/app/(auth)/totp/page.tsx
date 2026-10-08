import { Card } from '@dala/ui-web';
import Image from 'next/image';

import { TotpForm } from './TotpForm';

export default function TotpPage() {
  return (
    <main className="bg-neutral-25 relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="bg-accent-100/40 pointer-events-none absolute -end-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
      <Card raised className="relative z-10 w-full max-w-sm p-8">
        <Image
          src="/logo-mark.png"
          alt="Dala"
          width={40}
          height={40}
          className="mb-4 h-10 w-10"
        />
        <h1 className="font-display text-xl font-semibold text-neutral-900">
          Code de vérification
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entrez le code à 6 chiffres de votre application d'authentification.
        </p>
        <TotpForm />
      </Card>
    </main>
  );
}

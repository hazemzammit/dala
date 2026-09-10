import { Card } from '@dala/ui-web';

import { TotpForm } from './TotpForm';

export default function TotpPage() {
  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center">
      <Card raised className="w-full max-w-sm p-8">
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

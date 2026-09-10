import { Card } from '@dala/ui-web';

import { TotpSetupForm } from './TotpSetupForm';

export default function TotpSetupPage() {
  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center">
      <Card raised className="w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-semibold text-neutral-900">
          Configuration de la double authentification
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Scannez ce code dans Google Authenticator, 1Password ou une app équivalente, puis entrez
          le code généré.
        </p>
        <TotpSetupForm />
      </Card>
    </main>
  );
}

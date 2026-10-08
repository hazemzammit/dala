import { Card } from '@dala/ui-web';
import Image from 'next/image';

import logo from '../../../../assets/logo.png';

/**
 * Doc 01 §1.3.3 step 5 — "check your email" interstitial. Not a dead end:
 * per step 6, the account can already view a read-only, banner-nagged
 * dashboard before verifying.
 */
export default function CheckEmailPage() {
  return (
    <main className="bg-neutral-25 relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="bg-accent-100/40 pointer-events-none absolute -end-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
      <Card className="relative z-10 w-full max-w-sm p-8 text-center">
        <Image src={logo} alt="Dala" className="mx-auto mb-6 h-8 w-auto" priority />
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Vérifiez votre e-mail
        </h1>
        <p className="mt-3 text-sm text-neutral-500">
          Nous avons envoyé un lien de confirmation. Cliquez dessus pour activer toutes les
          fonctionnalités de votre compte.
        </p>
        <a
          href="/dashboard"
          className="text-accent-600 mt-6 inline-block text-sm font-medium underline"
        >
          Continuer vers le tableau de bord
        </a>
      </Card>
    </main>
  );
}

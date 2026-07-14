/**
 * Doc 01 §1.3.3 step 5 — "check your email" interstitial. Not a dead end:
 * per step 6, the account can already view a read-only, banner-nagged
 * dashboard before verifying — this screen should link to /dashboard, not
 * trap the user here. Wire that link once the dashboard reads
 * email_verified_at and renders its own nag banner.
 */
export default function CheckEmailPage() {
  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <div className="rounded-card bg-neutral-0 w-full max-w-sm border border-neutral-100 p-8 text-center">
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
      </div>
    </main>
  );
}

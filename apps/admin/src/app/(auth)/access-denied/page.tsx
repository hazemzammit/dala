import { Card } from '@dala/ui-web';
import { WarningIcon } from '@phosphor-icons/react/ssr';
import Image from 'next/image';
/**
 * Doc 04 §4.3.1 — rendered by middleware.ts via a rewrite when the request
 * IP isn't in ADMIN_IP_ALLOWLIST. Deliberately shows no login form.
 */
export default function AccessDeniedPage() {
  return (
    <main className="bg-neutral-25 relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="bg-danger/10 pointer-events-none absolute -end-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
      <Card raised className="relative z-10 max-w-sm p-8 text-center">
        <Image
          src="/logo-mark.png"
          alt="Dala"
          width={40}
          height={40}
          className="mx-auto mb-4 h-10 w-10 opacity-60 grayscale"
        />
        <div className="bg-danger/10 text-danger mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full">
          <WarningIcon size={20} weight="bold" />
        </div>
        <h1 className="font-display text-lg font-semibold text-neutral-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Cette adresse n'est pas autorisée à accéder à cette application.
        </p>
      </Card>
    </main>
  );
}

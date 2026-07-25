import { Card } from '@/components/ui/Card';

/**
 * Doc 04 §4.3.1 — rendered by middleware.ts via a rewrite when the request
 * IP isn't in ADMIN_IP_ALLOWLIST. Deliberately shows no login form.
 */
export default function AccessDeniedPage() {
  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center">
      <Card raised className="max-w-sm p-8 text-center">
        <h1 className="font-display text-lg font-semibold text-neutral-900">Accès refusé</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Cette adresse n'est pas autorisée à accéder à cette application.
        </p>
      </Card>
    </main>
  );
}

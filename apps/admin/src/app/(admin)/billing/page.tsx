import { Card } from '@/components/ui/Card';

/** Doc 04 §4.3.7 — blocked on the TVA/tax decision (Doc 00 §0.5 item 9) and no subscriptions/payments table exists yet. */
export default function StubPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">
        Abonnements et Facturation
      </h1>
      <Card className="mt-6 border-dashed p-8 text-center">
        <p className="text-sm text-neutral-500">
          Pas encore construit. Voir le guide de build de l'admin, section correspondante.
        </p>
      </Card>
    </div>
  );
}

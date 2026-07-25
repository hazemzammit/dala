import { Card } from '@/components/ui/Card';

/** Doc 04 §4.3.8 — no per-org storage-usage tracking or upload path convention exists yet. */
export default function StubPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">
        Surveillance du stockage
      </h1>
      <Card className="mt-6 border-dashed p-8 text-center">
        <p className="text-sm text-neutral-500">
          Pas encore construit. Voir le guide de build de l'admin, section correspondante.
        </p>
      </Card>
    </div>
  );
}

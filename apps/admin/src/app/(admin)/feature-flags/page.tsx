import { FeatureFlagsTable } from './FeatureFlagsTable';

/**
 * Doc 01 §1.13, admin remediation Tier 4.10. Per-org boolean flags only —
 * see migration 0068's header for the scope decision. Explicitly not the
 * free-tier billing caps (migration 0044) — this is for experimental/
 * rollout features.
 */
export default function FeatureFlagsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Feature flags</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Activation par défaut et surcharges par organisation. Distinct des plafonds de l'offre
        gratuite (facturation).
      </p>
      <div className="mt-6">
        <FeatureFlagsTable />
      </div>
    </div>
  );
}

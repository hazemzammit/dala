import { PageHero } from '@dala/ui-web';
import { FlagIcon } from '@phosphor-icons/react/ssr';

import { FeatureFlagsTable } from './FeatureFlagsTable';

/**
 * Doc 01 §1.13, admin remediation Tier 4.10. Per-org boolean flags only —
 * see migration 0068's header for the scope decision. Explicitly not the
 * free-tier billing caps (migration 0044) — this is for experimental/
 * rollout features.
 *
 * Phase 5 (plan §5.12) — bare <h1> + <p> becomes a PageHero
 * (icon FlagIcon, same title "Feature flags", existing description
 * moved into `description` verbatim).
 */
export default function FeatureFlagsPage() {
  return (
    <div>
      <PageHero
        icon={FlagIcon}
        title="Feature flags"
        description="Activation par défaut et surcharges par organisation. Distinct des plafonds de l'offre gratuite (facturation)."
      />
      <div className="mt-6">
        <FeatureFlagsTable />
      </div>
    </div>
  );
}

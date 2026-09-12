import { PageHero } from '@dala/ui-web';
import { DeviceMobileIcon } from '@phosphor-icons/react/ssr';

import { AppVersionsForm } from './AppVersionsForm';

/**
 * Doc 01 §1.8.2 — App version / forced-update, editable from Platform
 * Admin (admin remediation Tier 2.5). Grouped near Services Health in the
 * sidebar nav — same "operational lever" category, not user/org/billing
 * data management.
 *
 * Phase 5 (plan §5.11) — bare <h1> + <p> becomes a PageHero
 * (icon DeviceMobileIcon, same title "Versions de l'application",
 * existing description moved into `description` verbatim).
 */
export default function AppVersionsPage() {
  return (
    <div>
      <PageHero
        icon={DeviceMobileIcon}
        title="Versions de l'application"
        description="Version publiée et version minimale supportée par plateforme."
      />
      <div className="mt-6">
        <AppVersionsForm />
      </div>
    </div>
  );
}

import { PageHero } from '@dala/ui-web';
import { MonitorIcon } from '@phosphor-icons/react/ssr';

import { SessionsTable } from './SessionsTable';

/**
 * Doc 04 §4.3.11, admin remediation Tier 4.9. Own minimal screen rather
 * than a tab on Admin User Management (the plan's own "or" option) — no
 * tab-navigation component exists anywhere in this app yet, and adding
 * one just for this would be more UI surface than a single new sidebar
 * screen, consistent with how App Versions (Tier 2.5) became its own
 * screen for the same reason.
 *
 * Phase 5 (§5.15, minimal) — bare <h1> + <p> becomes a PageHero with the
 * route's MonitorIcon. The page's existing description is preserved
 * verbatim as the PageHero description prop. The table below is restyled
 * per the same section (revoke action → IconActionButton). This file only
 * owns the hero. */
export default function AdminSessionsPage() {
  return (
    <div>
      <PageHero
        icon={MonitorIcon}
        title="Sessions admin"
        description="Vos sessions actives. Un Super Admin voit également celles des autres admins."
      />
      <div className="mt-6">
        <SessionsTable />
      </div>
    </div>
  );
}

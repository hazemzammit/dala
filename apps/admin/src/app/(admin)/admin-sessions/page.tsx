import { SessionsTable } from './SessionsTable';

/**
 * Doc 04 §4.3.11, admin remediation Tier 4.9. Own minimal screen rather
 * than a tab on Admin User Management (the plan's own "or" option) — no
 * tab-navigation component exists anywhere in this app yet, and adding
 * one just for this would be more UI surface than a single new sidebar
 * screen, consistent with how App Versions (Tier 2.5) became its own
 * screen for the same reason.
 */
export default function AdminSessionsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Sessions admin</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Vos sessions actives. Un Super Admin voit également celles des autres admins.
      </p>
      <div className="mt-6">
        <SessionsTable />
      </div>
    </div>
  );
}

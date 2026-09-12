import { PageHero } from '@dala/ui-web';
import { ShieldCheckIcon } from '@phosphor-icons/react/ssr';

import { AdminUsersTable } from './AdminUsersTable';

export default function AdminUsersPage() {
  return (
    <div>
      {/* Phase 5 (§5.14, minimal) — bare <h1> becomes a PageHero with the
          route's ShieldCheckIcon. Title preserved verbatim from the
          original <h1>. No description prop: this page has none today and
          none is invented (PageHero's description is optional). The table
          below is restyled per the same section's other bullets. */}
      <PageHero icon={ShieldCheckIcon} title="Gestion des admins" />
      <div className="mt-6">
        <AdminUsersTable />
      </div>
    </div>
  );
}

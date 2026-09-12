import { PageHero } from '@dala/ui-web';
import { DatabaseIcon } from '@phosphor-icons/react/ssr';

import { PendingApprovals } from './PendingApprovals';
import { QueryEditor } from './QueryEditor';

export default function DbExplorerPage() {
  return (
    <div className="space-y-6">
      {/* Phase 5 (§5.6, minimal) — bare <h1> becomes a PageHero with the
          route's DatabaseIcon. Description mirrors the documented policy
          already in QueryEditor.tsx / PendingApprovals.tsx — read-only by
          default, writes are Super-Admin-only, danger zone is
          INSERT/UPDATE/DELETE, logged to the audit journal, and when the
          team has 2+ admins a second admin must approve before execution.
          No new policy language invented. Title kept as "Database Explorer"
          to match the sidebar label (Sidebar.tsx) and the Feature flags
          precedent. The page's two internal sections are each wrapped in a
          SectionCard (see those files); this file only owns the hero. */}
      <PageHero
        icon={DatabaseIcon}
        title="Database Explorer"
        description="Requêtes en lecture seule par défaut. Écritures Super-Admin uniquement (INSERT/UPDATE/DELETE en zone dangereuse) : journalisées dans le journal d'audit. Si votre équipe compte 2+ admins, un second admin devra approuver avant exécution."
      />
      <PendingApprovals />
      <QueryEditor />
    </div>
  );
}

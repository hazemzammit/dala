import { PageHero } from '@dala/ui-web';
import { ClipboardIcon } from '@phosphor-icons/react/ssr';
import { Suspense } from 'react';

import { AuditLogTable } from './AuditLogTable';

export default function AuditLogPage() {
  return (
    <div>
      {/* Phase 5 (§5.14, minimal) — bare <h1> becomes a PageHero with the
          route's ClipboardListIcon and the page's existing title verbatim.
          No description prop: this page has none today and none is invented
          (PageHero's description is optional). The table, search, and
          pagination below are untouched — the plan's "table restyle + icon
          buttons" language is inert here (Card-row list, no row actions). */}
      <PageHero icon={ClipboardIcon} title="Journal d'audit" />
      <div className="mt-6">
        {/* Admin remediation Tier 4.4 — same useSearchParams()-requires-
            Suspense reasoning as apps/(admin)/users/page.tsx. */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
          <AuditLogTable />
        </Suspense>
      </div>
    </div>
  );
}

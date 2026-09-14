import { PageHero } from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react/ssr';
import { Suspense } from 'react';

import { OrganizationsTable } from './OrganizationsTable';

export default function OrganizationsPage() {
  return (
    <div>
      <PageHero
        icon={BuildingsIcon}
        title="Organisations"
        description="Gérez les comptes contractants : plans, membres, statut et vérification."
      />
      <div className="mt-6">
        {/* Phase 5.3 (premium-ux-system-guide §15) — OrganizationsTable now
            calls useSearchParams() (URL-persisted filter/view/page), which
            Next.js requires to be wrapped in Suspense or the build emits a
            "should be wrapped in a suspense boundary" error — same Tier 4.4
            fix users/page.tsx already has. */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
          <OrganizationsTable />
        </Suspense>
      </div>
    </div>
  );
}

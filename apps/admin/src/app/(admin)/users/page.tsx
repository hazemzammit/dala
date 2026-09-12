import { PageHero } from '@dala/ui-web';
import { UsersThreeIcon } from '@phosphor-icons/react/ssr';
import { Suspense } from 'react';

import { UsersTable } from './UsersTable';

export default function UsersPage() {
  return (
    <div>
      <PageHero
        icon={UsersThreeIcon}
        title="Utilisateurs"
        description="Comptes contractants et ouvriers, toutes organisations confondues."
      />
      <div className="mt-6">
        {/* Admin remediation Tier 4.4 — UsersTable now calls
            useSearchParams() (to read GlobalSearch's `?q=` deep link),
            which Next.js requires to be wrapped in Suspense or the build
            emits a "should be wrapped in a suspense boundary" error. */}
        <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
          <UsersTable />
        </Suspense>
      </div>
    </div>
  );
}

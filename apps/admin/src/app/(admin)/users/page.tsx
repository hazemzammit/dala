import { Suspense } from 'react';

import { UsersTable } from './UsersTable';

export default function UsersPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Utilisateurs</h1>
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

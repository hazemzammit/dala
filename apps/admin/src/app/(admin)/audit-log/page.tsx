import { Suspense } from 'react';

import { AuditLogTable } from './AuditLogTable';

export default function AuditLogPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Journal d'audit</h1>
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

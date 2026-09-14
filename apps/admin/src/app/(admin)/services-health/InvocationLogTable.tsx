'use client';

import type { EdgeFunctionInvocation } from '@dala/shared-types';
import {
  DataTable,
  type DataTableColumn,
  ErrorState,
  Pagination,
  StatusBadge,
  TableSkeleton,
} from '@dala/ui-web';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const PAGE_SIZE = 50;

// The functions retrofitted with _shared/logInvocation.ts as of migration
// 0057 — see that migration's header for the full list this mirrors.
// function_name has no DB CHECK constraint (see EdgeFunctionInvocation's
// own doc comment in shared-types), so this is a UI convenience list, not
// an enforced enum — a future retrofit just needs to add its name here too
// for the filter dropdown to offer it.
const KNOWN_FUNCTIONS = [
  'send-organization-invitation-email',
  'send-project-invitation-email',
  'generate-report',
  'export-org-data',
  'mfa-recover',
  'delete-account',
  'payment-webhook',
];

export function InvocationLogTable() {
  // Phase 5.3 (premium-ux-system-guide.md §15) — filters/page live in the
  // URL as the single source of truth (shareable, reload-stable), replacing
  // three local useStates. Every write goes through setParams() →
  // router.replace({ scroll: false }); defaults ('' = all, page 1) are
  // never serialized, so a param-less URL behaves exactly as before. Param
  // names mirror the API params they feed (functionName/status).
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const functionFilter = searchParams.get('functionName') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const page = Number(searchParams.get('page')) || 1;

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const [invocations, setInvocations] = useState<EdgeFunctionInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as this route's other tables.
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);

  // Same name/signature as the old setter-based applyFilter, so the two
  // <select> call sites below stay byte-identical apart from the key
  // argument; the page-1 reset lands in the same URL write (the old one
  // did setter + setPage(1)). Any filter change resets to page 1 — stale
  // page/filter combinations would otherwise silently return zero rows.
  function applyFilter(which: 'functionName' | 'status', value: string) {
    setParams({ [which]: value, page: null });
  }

  // Same name/signature as the useState setter it replaces, so the
  // Pagination call site below stays byte-identical.
  function setPage(next: number) {
    setParams({ page: next === 1 ? null : String(next) });
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (functionFilter) params.set('functionName', functionFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/services-health/invocations?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setInvocations(data.invocations ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Re-fetch on page or filter change; load() reads the latest filter
    // values via closure, same pattern as AuditLogTable's own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, functionFilter, statusFilter]);

  const columns: DataTableColumn<EdgeFunctionInvocation>[] = [
    {
      key: 'invoked_at',
      header: 'Date',
      sortValue: (i) => i.invoked_at,
      render: (i) => new Date(i.invoked_at).toLocaleString('fr-FR'),
    },
    {
      key: 'function_name',
      header: 'Fonction',
      render: (i) => <span className="font-mono text-xs">{i.function_name}</span>,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (i) => (
        <StatusBadge variant={i.status === 'success' ? 'success' : 'danger'}>
          {i.status}
        </StatusBadge>
      ),
    },
    {
      key: 'duration_ms',
      header: 'Durée',
      align: 'right',
      render: (i) => (i.duration_ms != null ? `${i.duration_ms} ms` : '—'),
    },
    {
      key: 'org_id',
      header: 'Org',
      render: (i) => i.org_id?.slice(0, 8) ?? '—',
    },
    {
      key: 'error_message',
      header: 'Erreur',
      render: (i) => (
        <span className="line-clamp-1 max-w-xs text-neutral-500">{i.error_message ?? '—'}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          value={functionFilter}
          onChange={(e) => applyFilter('functionName', e.target.value)}
          className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-2 text-sm outline-none"
        >
          <option value="">Toutes les fonctions</option>
          {KNOWN_FUNCTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => applyFilter('status', e.target.value)}
          className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-2 text-sm outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="success">Succès</option>
          <option value="error">Erreur</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <>
          {/* Phase 4.7 (§5 Services-Health item / §2.4) — `bare` (the
              SectionCard in page.tsx supplies the raised boundary) + the
              shared Pagination replacing the hand-rolled count text and
              Précédent/Suivant buttons — same accessible names, per the
              test contract. Props map onto this file's existing
              page/total state; Pagination derives totalPages itself. */}
          <DataTable bare columns={columns} rows={invocations} getRowId={(i) => i.id} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

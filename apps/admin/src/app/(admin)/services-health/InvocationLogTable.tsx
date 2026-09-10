'use client';

import type { EdgeFunctionInvocation } from '@dala/shared-types';
import { Button, DataTable, type DataTableColumn, ErrorState, StatusBadge } from '@dala/ui-web';
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
  const [invocations, setInvocations] = useState<EdgeFunctionInvocation[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as this route's other tables.
  const [loadError, setLoadError] = useState(false);
  const [functionFilter, setFunctionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

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

  function applyFilter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1); // any filter change resets to page 1 — stale page/filter
    // combinations would otherwise silently return zero rows.
  }

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          value={functionFilter}
          onChange={(e) => applyFilter(setFunctionFilter, e.target.value)}
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
          onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
          className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-2 text-sm outline-none"
        >
          <option value="">Tous les statuts</option>
          <option value="success">Succès</option>
          <option value="error">Erreur</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <>
          <DataTable columns={columns} rows={invocations} getRowId={(i) => i.id} />
          <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
            <span>
              {total} invocation{total !== 1 ? 's' : ''} — page {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 text-xs"
              >
                Précédent
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 text-xs"
              >
                Suivant
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

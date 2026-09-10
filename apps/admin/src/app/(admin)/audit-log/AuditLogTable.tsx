'use client';

import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  StatusBadge,
} from '@dala/ui-web';
import { ClipboardTextIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Entry {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  org_id: string | null;
  ip_address: string | null;
  impersonated_user_id: string | null;
  created_at: string;
}

// Doc 04 §4.3.6 — filters across all six spec-listed dimensions: user, org,
// action, table, date (from/to), IP. org_id/ip_address only exist on
// audit_log as of migration 0052 — rows written before that migration have
// both null, so filtering on them naturally excludes pre-0052 history
// rather than silently misreporting it.
export function AuditLogTable() {
  // Admin remediation Tier 4.4 — GlobalSearch links here with `?action=`
  // to deep-link a pre-filtered view. Read once on mount, same "this
  // screen's own filter state becomes the source of truth from here on,
  // not kept in sync with the URL afterward" reasoning as UsersTable.tsx.
  const searchParams = useSearchParams();
  const initialAction = searchParams.get('action') ?? '';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as the other admin tables: no res.ok
  // check on this filtered fetch.
  const [loadError, setLoadError] = useState(false);
  const [actionFilter, setActionFilter] = useState(initialAction);
  const [tableFilter, setTableFilter] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [orgIdFilter, setOrgIdFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (tableFilter) params.set('table', tableFilter);
      if (actorIdFilter) params.set('actorId', actorIdFilter);
      if (orgIdFilter) params.set('orgId', orgIdFilter);
      if (ipFilter) params.set('ipAddress', ipFilter);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Intentionally runs once on mount — `load()` reads the latest filter
    // values via closure each time it's invoked from the Filtrer button,
    // so none of them need to be a dependency here.
  }, []);

  const columns: DataTableColumn<Entry>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortValue: (e) => e.created_at,
      render: (e) => new Date(e.created_at).toLocaleString('fr-FR'),
    },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <span className="font-mono text-xs">{e.action}</span>,
    },
    {
      key: 'target',
      header: 'Cible',
      render: (e) => (e.target_table ? `${e.target_table}:${e.target_id?.slice(0, 8)}` : '—'),
    },
    {
      key: 'org',
      header: 'Org',
      render: (e) => e.org_id?.slice(0, 8) ?? '—',
    },
    { key: 'actor', header: 'Acteur', render: (e) => e.actor_id?.slice(0, 8) ?? '—' },
    {
      key: 'ip_address',
      header: 'IP',
      render: (e) => <span className="font-mono text-xs">{e.ip_address ?? '—'}</span>,
    },
    {
      key: 'impersonation',
      header: 'Impersonation',
      render: (e) =>
        e.impersonated_user_id ? (
          <StatusBadge variant="warning">{e.impersonated_user_id.slice(0, 8)}</StatusBadge>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          type="text"
          placeholder="Action (ex: org.suspend)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-48 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <input
          type="text"
          placeholder="Table (ex: organizations)"
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-44 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <input
          type="text"
          placeholder="ID utilisateur admin"
          value={actorIdFilter}
          onChange={(e) => setActorIdFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-44 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <input
          type="text"
          placeholder="ID organisation"
          value={orgIdFilter}
          onChange={(e) => setOrgIdFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-44 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <input
          type="text"
          placeholder="Adresse IP"
          value={ipFilter}
          onChange={(e) => setIpFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-36 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <label className="flex flex-col text-xs text-neutral-500">
          Du
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-1.5 text-sm outline-none"
          />
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          Au
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-1.5 text-sm outline-none"
          />
        </label>
        <Button variant="secondary" onClick={load}>
          Filtrer
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          rows={entries}
          getRowId={(e) => e.id}
          emptyState={
            <EmptyState
              icon={ClipboardTextIcon}
              title="Aucune entrée"
              description="Aucune action ne correspond à ce filtre."
            />
          }
        />
      )}
    </div>
  );
}

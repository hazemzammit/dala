'use client';

import { ClipboardTextIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface Entry {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  impersonated_user_id: string | null;
  created_at: string;
}

export function AuditLogTable() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
    const data = await res.json();
    setEntries(data.entries ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Intentionally runs once on mount — `load()` reads the latest
    // `actionFilter` via closure each time it's invoked from the Filtrer
    // button, so it doesn't need to be a dependency here.
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
    { key: 'actor', header: 'Acteur', render: (e) => e.actor_id?.slice(0, 8) ?? '—' },
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
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Filtrer par action (ex: org.suspend)"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-control focus:border-accent-600 w-72 border border-neutral-300 px-3 py-2 text-sm outline-none"
        />
        <Button variant="secondary" onClick={load}>
          Filtrer
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
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

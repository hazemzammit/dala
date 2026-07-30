'use client';

import type { OrgStorageUsage } from '@dala/shared-types';
import { BuildingsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

// Doc 00 §0.3 item 7 — free-tier storage-overage policy, labels shown next
// to each org's usage. Only meaningful for plan === 'free'; other plans
// show "Pas de seuil défini" rather than a fabricated limit.
const OVERAGE_LABELS: Record<
  OrgStorageUsage['overage_status'],
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  ok: { label: 'Sous le seuil', variant: 'success' },
  warning: { label: '≥ 800 Mo — bannière/e-mail', variant: 'warning' },
  critical: { label: '≥ 950 Mo — upload mis en file', variant: 'warning' },
  over_limit: { label: '≥ 1 Go — lecture seule', variant: 'danger' },
  no_limit_defined: { label: 'Pas de seuil défini', variant: 'neutral' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Mo';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} Mo`;
  return `${(mb / 1024).toFixed(2)} Go`;
}

export function StorageUsageTable() {
  const [rows, setRows] = useState<OrgStorageUsage[]>([]);
  const [totals, setTotals] = useState<{
    totalBytes: number;
    totalFiles: number;
    orgCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch('/api/admin/storage');
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue.');
      } else {
        setRows(data.rows ?? []);
        setTotals(data.totals ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: DataTableColumn<OrgStorageUsage>[] = [
    {
      key: 'organization_name',
      header: 'Organisation',
      sortValue: (r) => r.organization_name.toLowerCase(),
      render: (r) => (
        <Link
          href={`/organizations/${r.organization_id}`}
          className="text-accent-600 font-medium hover:underline"
        >
          {r.organization_name}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan ?? '',
      render: (r) => (r.plan ? <StatusBadge variant="info">{r.plan}</StatusBadge> : '—'),
    },
    {
      key: 'file_count',
      header: 'Fichiers',
      align: 'right',
      sortValue: (r) => r.file_count,
      render: (r) => r.file_count.toLocaleString('fr-FR'),
    },
    {
      key: 'total_bytes',
      header: 'Stockage utilisé',
      align: 'right',
      sortValue: (r) => r.total_bytes,
      render: (r) => formatBytes(r.total_bytes),
    },
    {
      key: 'org_status',
      header: 'Statut',
      render: (r) =>
        r.deleted_at ? (
          <StatusBadge variant="danger">Supprimée</StatusBadge>
        ) : r.suspended_at ? (
          <StatusBadge variant="warning">Suspendue</StatusBadge>
        ) : (
          <StatusBadge variant="success">Active</StatusBadge>
        ),
    },
    {
      key: 'overage_status',
      header: 'Quota (Doc 00 §0.3)',
      render: (r) => {
        const cfg = OVERAGE_LABELS[r.overage_status];
        return <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>;
      },
    },
  ];

  if (error) {
    return (
      <Card className="mt-6 p-8">
        <p className="text-danger text-sm">Erreur : {error}</p>
      </Card>
    );
  }

  if (loading) {
    return <p className="mt-6 text-sm text-neutral-500">Chargement…</p>;
  }

  return (
    <div className="mt-6">
      {totals && (
        <p className="mb-3 text-sm text-neutral-500">
          {totals.orgCount} organisation{totals.orgCount === 1 ? '' : 's'} ·{' '}
          {totals.totalFiles.toLocaleString('fr-FR')} fichier{totals.totalFiles === 1 ? '' : 's'} ·{' '}
          {formatBytes(totals.totalBytes)} au total
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.organization_id}
        emptyState={
          <EmptyState
            icon={BuildingsIcon}
            title="Aucune organisation"
            description="Pas encore d'organisations dans cet environnement."
          />
        }
      />
    </div>
  );
}

'use client';

import type { ScheduledJobRun } from '@dala/shared-types';
import { DataTable, type DataTableColumn, ErrorState, StatusBadge } from '@dala/ui-web';
import { useEffect, useState } from 'react';

interface JobStatus {
  job_name: string;
  latest: ScheduledJobRun | null;
  lastTwoFailed: boolean;
  recentRuns: ScheduledJobRun[];
}

export function ScheduledJobsTable() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as this route's other tables.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/services-health')
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const columns: DataTableColumn<JobStatus>[] = [
    {
      key: 'job_name',
      header: 'Job',
      render: (j) => (
        <span className="flex items-center gap-2 font-mono text-xs text-neutral-900">
          {j.job_name}
          {j.lastTwoFailed && <StatusBadge variant="danger">2 échecs consécutifs</StatusBadge>}
        </span>
      ),
    },
    {
      key: 'started_at',
      header: 'Dernière exécution',
      render: (j) =>
        j.latest ? new Date(j.latest.started_at).toLocaleString('fr-FR') : 'Jamais exécuté',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (j) =>
        j.latest ? (
          <StatusBadge
            variant={
              j.latest.status === 'success'
                ? 'success'
                : j.latest.status === 'failed'
                  ? 'danger'
                  : 'warning'
            }
          >
            {j.latest.status}
          </StatusBadge>
        ) : (
          '—'
        ),
    },
    {
      key: 'retry_count',
      header: 'Tentatives',
      align: 'right',
      render: (j) => j.latest?.retry_count ?? '—',
    },
    {
      key: 'error',
      header: 'Erreur',
      render: (j) => (
        <span className="line-clamp-1 max-w-xs text-neutral-500">
          {j.latest?.error_message ?? '—'}
        </span>
      ),
    },
  ];

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;
  if (loadError) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;

  return <DataTable columns={columns} rows={jobs} getRowId={(j) => j.job_name} />;
}

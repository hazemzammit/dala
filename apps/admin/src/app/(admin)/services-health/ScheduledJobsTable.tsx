'use client';

import { useEffect, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface Run {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  error_message: string | null;
  retry_count: number;
}

interface JobStatus {
  job_name: string;
  latest: Run | null;
  lastTwoFailed: boolean;
  recentRuns: Run[];
}

export function ScheduledJobsTable() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/services-health')
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .finally(() => setLoading(false));
  }, []);

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

  return <DataTable columns={columns} rows={jobs} getRowId={(j) => j.job_name} />;
}

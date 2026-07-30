'use client';

import { BuildingsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface OrgRow {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  suspended_at: string | null;
  deleted_at: string | null;
}

interface PlanCount {
  plan: string;
  count: number;
}

export function BillingTable() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [distribution, setDistribution] = useState<PlanCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch('/api/admin/billing');
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue.');
      } else {
        setOrgs(data.organizations ?? []);
        setDistribution(data.planDistribution ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: DataTableColumn<OrgRow>[] = [
    {
      key: 'name',
      header: 'Organisation',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <Link
          href={`/organizations/${r.id}`}
          className="text-accent-600 font-medium hover:underline"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan,
      render: (r) => <StatusBadge variant="info">{r.plan}</StatusBadge>,
    },
    {
      key: 'created_at',
      header: 'Créée le',
      sortValue: (r) => r.created_at,
      render: (r) => new Date(r.created_at).toLocaleDateString('fr-FR'),
    },
    {
      key: 'status',
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
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <Link
          href={`/organizations/${r.id}`}
          className="text-accent-600 text-xs font-medium hover:underline"
        >
          Modifier le plan →
        </Link>
      ),
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
      {distribution.length > 0 && (
        <p className="mb-3 text-sm text-neutral-500">
          Répartition des plans : {distribution.map((d) => `${d.plan} (${d.count})`).join(' · ')}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={orgs}
        getRowId={(r) => r.id}
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

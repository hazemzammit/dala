'use client';

import { BuildingsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface OrgRow {
  id: string;
  name: string;
  trade_type: string | null;
  plan: string;
  created_at: string;
  member_count: number;
}

export function OrganizationsTable() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{
    org: OrgRow;
    action: 'suspend' | 'soft_delete';
  } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/organizations');
    const data = await res.json();
    setOrgs(data.organizations ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runAction(reason: string) {
    if (!pendingAction) return;
    await fetch(`/api/admin/organizations/${pendingAction.org.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: pendingAction.action,
        reason,
        confirmName: pendingAction.org.name,
      }),
    });
    setPendingAction(null);
    await load();
  }

  const columns: DataTableColumn<OrgRow>[] = [
    {
      key: 'name',
      header: 'Nom',
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
      key: 'trade_type',
      header: 'Type',
      render: (r) => r.trade_type ?? '—',
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan,
      render: (r) => <StatusBadge variant="info">{r.plan}</StatusBadge>,
    },
    {
      key: 'member_count',
      header: 'Membres',
      align: 'right',
      sortValue: (r) => r.member_count,
      render: (r) => r.member_count,
    },
    {
      key: 'created_at',
      header: 'Créée le',
      sortValue: (r) => r.created_at,
      render: (r) => new Date(r.created_at).toLocaleDateString('fr-FR'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPendingAction({ org: r, action: 'suspend' })}
            className="text-warning text-xs font-medium hover:underline"
          >
            Suspendre
          </button>
          <button
            onClick={() => setPendingAction({ org: r, action: 'soft_delete' })}
            className="text-danger text-xs font-medium hover:underline"
          >
            Supprimer
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return <p className="text-sm text-neutral-500">Chargement…</p>;
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={orgs}
        getRowId={(r) => r.id}
        emptyState={
          <EmptyState
            icon={BuildingsIcon}
            title="Aucune organisation"
            description="Les organisations créées par les contractants apparaîtront ici."
          />
        }
      />

      {pendingAction && (
        <ConfirmTypingDialog
          title={
            pendingAction.action === 'suspend'
              ? "Suspendre l'organisation"
              : "Supprimer l'organisation"
          }
          description="Cette action est journalisée dans le journal d'audit. Le compte est bloqué (suspension) ou récupérable pendant 30 jours (suppression)."
          confirmValue={pendingAction.org.name}
          confirmLabel={pendingAction.action === 'suspend' ? 'Suspendre' : 'Supprimer'}
          requireReason
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

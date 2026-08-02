'use client';

import { PlusIcon, WalletIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { approveAdvance, rejectAdvance } from './actions';
import { AdvanceFormModal } from './AdvanceFormModal';

import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';


type Advance = {
  id: string;
  worker_id: string;
  amount: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};
type Worker = { id: string; full_name: string };

const STATUS_LABEL: Record<Advance['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Rejetée',
};
const STATUS_VARIANT: Record<Advance['status'], 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export function AdvancesView({ advances, workers }: { advances: Advance[]; workers: Worker[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [rows, setRows] = useState(advances);
  const [isPending, startTransition] = useTransition();

  const workerNameById = new Map(workers.map((w) => [w.id, w.full_name]));

  const totalPending = rows
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => sum + a.amount, 0);

  function handleApprove(id: string) {
    startTransition(async () => {
      const result = await approveAdvance({ advance_id: id, idempotency_key: crypto.randomUUID() });
      if (result.success) {
        setRows((current) => current.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)));
      }
    });
  }

  function handleReject(id: string) {
    startTransition(async () => {
      const result = await rejectAdvance(id);
      if (result.success) {
        setRows((current) => current.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)));
      }
    });
  }

  const columns: DataTableColumn<Advance>[] = [
    {
      key: 'worker',
      header: 'Ouvrier',
      render: (a) => <span className="font-medium">{workerNameById.get(a.worker_id) ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (a) => `${a.amount.toLocaleString('fr-TN')} TND`,
      align: 'right',
      sortValue: (a) => a.amount,
    },
    {
      key: 'reason',
      header: 'Motif',
      render: (a) => a.reason ?? '—',
    },
    {
      key: 'date',
      header: 'Date',
      render: (a) => new Date(a.created_at).toLocaleDateString('fr-TN'),
      sortValue: (a) => a.created_at,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (a) => (
        <StatusBadge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        a.status === 'pending' ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleApprove(a.id)}
              disabled={isPending}
              className="text-success text-sm font-medium hover:underline"
            >
              Approuver
            </button>
            <button
              onClick={() => handleReject(a.id)}
              disabled={isPending}
              className="text-danger text-sm font-medium hover:underline"
            >
              Rejeter
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-neutral-900">Avances</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Suivez les avances sur salaire de vos ouvriers.
          </p>
        </div>
        {workers.length > 0 && (
          <Button onClick={() => setModalOpen(true)}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Nouvelle avance
          </Button>
        )}
      </div>

      {totalPending > 0 && (
        <div className="bg-neutral-25 mb-4 rounded-2xl border border-neutral-100 px-4 py-3 text-sm text-neutral-700">
          <span className="font-medium">{totalPending.toLocaleString('fr-TN')} TND</span> en attente
          d&apos;approbation
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title="Aucune avance pour le moment"
          description="Les demandes d'avance de vos ouvriers apparaîtront ici."
          actionLabel={workers.length > 0 ? 'Nouvelle avance' : undefined}
          onAction={workers.length > 0 ? () => setModalOpen(true) : undefined}
        />
      ) : (
        <DataTable columns={columns} rows={rows} getRowId={(a) => a.id} />
      )}

      {modalOpen && <AdvanceFormModal workers={workers} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

'use client';

import {
  Button,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import { PlusIcon, WalletIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { approveAdvance, rejectAdvance } from './actions';
import { AdvanceFormModal } from './AdvanceFormModal';


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
  const [isPending, startTransition] = useAsyncTransition();

  // §2.3 — bulk "Marquer tout comme payé", explicitly a web-only feature
  // per the spec ("reviewing a bulk action on a small screen is a worse
  // safety margin for a money-moving action" — mobile has no equivalent to
  // reference). Loops the existing per-advance `approveAdvance` action —
  // already idempotency-key-protected per-call (migration 0019/0048), so
  // N sequential calls is safe; no new bulk RPC needed. Per-item failures
  // are surfaced individually rather than treated as all-or-nothing, since
  // there's no single transaction wrapping them.
  const [bulkConfirmIds, setBulkConfirmIds] = useState<string[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);

  const workerNameById = new Map(workers.map((w) => [w.id, w.full_name]));

  const totalPending = rows
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => sum + a.amount, 0);

  // Doc 05 §1.7c (Tier 3, Phase 19C) — single-row Approve/Reject were
  // previously ungated; bulk-approve already had a plain ConfirmDialog
  // (left as-is, not upgraded to typed-confirmation — only the ungated
  // single-row actions needed that in 19C). Phase 19F / migration 0090:
  // approveAdvance/rejectAdvance both now require a real reason, so bulk
  // approve gained a mandatory reason field too (applied to every advance
  // in the batch) — an unavoidable consequence of the backend change, not
  // a re-opening of 19C's typed-confirmation scope decision.
  const [pendingAction, setPendingAction] = useState<{
    kind: 'approve' | 'reject';
    id: string;
    workerName: string;
  } | null>(null);
  const [bulkReason, setBulkReason] = useState('');

  function requestApprove(id: string) {
    const advance = rows.find((a) => a.id === id);
    const workerName = advance ? (workerNameById.get(advance.worker_id) ?? '—') : '—';
    setPendingAction({ kind: 'approve', id, workerName });
  }

  function requestReject(id: string) {
    const advance = rows.find((a) => a.id === id);
    const workerName = advance ? (workerNameById.get(advance.worker_id) ?? '—') : '—';
    setPendingAction({ kind: 'reject', id, workerName });
  }

  function handleApprove(id: string, reason: string) {
    startTransition(async () => {
      const result = await approveAdvance({
        advance_id: id,
        idempotency_key: crypto.randomUUID(),
        reason,
      });
      if (result.success) {
        setRows((current) => current.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)));
      }
      setPendingAction(null);
    });
  }

  function handleReject(id: string, reason: string) {
    startTransition(async () => {
      const result = await rejectAdvance({ advance_id: id, reason });
      if (result.success) {
        setRows((current) => current.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)));
      }
      setPendingAction(null);
    });
  }

  async function handleBulkApprove() {
    if (!bulkConfirmIds) return;
    setBulkRunning(true);
    setBulkErrors([]);
    const errors: string[] = [];

    for (const id of bulkConfirmIds) {
      const result = await approveAdvance({
        advance_id: id,
        idempotency_key: crypto.randomUUID(),
        reason: bulkReason,
      });
      if (result.success) {
        setRows((current) => current.map((a) => (a.id === id ? { ...a, status: 'approved' } : a)));
      } else {
        const name = workerNameById.get(rows.find((a) => a.id === id)?.worker_id ?? '') ?? id;
        errors.push(`${name} : ${result.error}`);
      }
    }

    setBulkRunning(false);
    setBulkErrors(errors);
    if (errors.length === 0) {
      setBulkConfirmIds(null);
      setBulkReason('');
    }
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
              onClick={() => requestApprove(a.id)}
              disabled={isPending}
              className="text-success text-sm font-medium hover:underline"
            >
              Approuver
            </button>
            <button
              onClick={() => requestReject(a.id)}
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
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {/* Phase 20 (§1.7h) — extracted from the ad hoc <h1> + action-button
          row, matching every other list-view screen's pattern. */}
      <PageHero
        icon={WalletIcon}
        title="Avances"
        description="Suivez les avances sur salaire de vos ouvriers."
        actions={
          workers.length > 0 && (
            <Button onClick={() => setModalOpen(true)}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Nouvelle avance
            </Button>
          )
        }
      />

      {totalPending > 0 && (
        <div className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-3 text-sm text-neutral-700">
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
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(a) => a.id}
          selectable
          bulkActions={(selectedIds) => {
            const pendingSelectedIds = selectedIds.filter(
              (id) => rows.find((a) => a.id === id)?.status === 'pending',
            );
            if (pendingSelectedIds.length === 0) return null;
            return (
              <button
                onClick={() => {
                  setBulkErrors([]);
                  setBulkReason('');
                  setBulkConfirmIds(pendingSelectedIds);
                }}
                className="text-accent-700 text-sm font-semibold hover:underline"
              >
                Marquer {pendingSelectedIds.length} comme payé(es)
              </button>
            );
          }}
        />
      )}

      {modalOpen && <AdvanceFormModal workers={workers} onClose={() => setModalOpen(false)} />}

      <ConfirmDialog
        open={bulkConfirmIds !== null}
        title="Approuver ces avances ?"
        description={
          bulkConfirmIds
            ? [
                `Vous êtes sur le point d'approuver ${bulkConfirmIds.length} avance(s) :`,
                ...bulkConfirmIds.map((id) => {
                  const advance = rows.find((a) => a.id === id);
                  const name = advance ? (workerNameById.get(advance.worker_id) ?? '—') : '—';
                  const amount = advance ? `${advance.amount.toLocaleString('fr-TN')} TND` : '';
                  return `• ${name} — ${amount}`;
                }),
                ...(bulkErrors.length > 0
                  ? ['', 'Échecs lors de la dernière tentative :', ...bulkErrors]
                  : []),
              ].join('\n')
            : ''
        }
        confirmLabel="Approuver"
        destructive={false}
        loading={bulkRunning}
        confirmDisabled={bulkReason.trim().length < 10}
        onConfirm={() => void handleBulkApprove()}
        onCancel={() => {
          setBulkConfirmIds(null);
          setBulkReason('');
        }}
      >
        <div className="mt-4">
          <label htmlFor="bulk-approve-reason" className="text-sm font-medium text-neutral-900">
            Motif (10 caractères minimum)
          </label>
          <textarea
            id="bulk-approve-reason"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            rows={2}
            className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
          />
        </div>
      </ConfirmDialog>

      {pendingAction && (
        <ConfirmTypingDialog
          title={
            pendingAction.kind === 'approve' ? 'Approuver la demande ?' : 'Rejeter la demande ?'
          }
          description={
            pendingAction.kind === 'approve'
              ? `Vous êtes sur le point d'approuver la demande d'avance de ${pendingAction.workerName}.`
              : `Vous êtes sur le point de rejeter la demande d'avance de ${pendingAction.workerName}.`
          }
          confirmValue={pendingAction.workerName}
          confirmLabel={pendingAction.kind === 'approve' ? 'Approuver' : 'Rejeter'}
          destructive={pendingAction.kind === 'reject'}
          requireReason
          onConfirm={(reason) => {
            if (pendingAction.kind === 'approve') handleApprove(pendingAction.id, reason);
            else handleReject(pendingAction.id, reason);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

'use client';

import type { InvitationStatus, Worker } from '@dala/shared-types';
import {
  Avatar,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterSelect,
  IconActionButton,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import { HardHatIcon, EyeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { deleteWorker } from './actions';
import { WorkerFormModal } from './WorkerFormModal';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

type InvitationSummary = { worker_id: string; status: InvitationStatus };
type ModalState = { mode: 'closed' } | { mode: 'invite' } | { mode: 'edit'; worker: WorkerRow };

const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'Invitation envoyée',
  accepted: 'Actif',
  expired: 'Invitation expirée',
};

const STATUS_VARIANT: Record<InvitationStatus, 'success' | 'warning' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'neutral',
};

type WorkerRow = Worker & {
  profession: string;
  attendance: number;
  currentProject: string;
  salaryAdvance: number;
  statusLabel: string;
};

export function TeamView({
  workers,
  invitations,
  attendanceByWorker,
  currentProjectByWorker,
  salaryAdvanceByWorker,
}: {
  workers: Worker[];
  invitations: InvitationSummary[];
  attendanceByWorker: Record<string, number>;
  currentProjectByWorker: Record<string, string>;
  salaryAdvanceByWorker: Record<string, number>;
}) {
  const [rows, setRows] = useState(workers);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<WorkerRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('invite') === '1') {
      setModalState({ mode: 'invite' });
    }
  }, [searchParams]);

  const latestInvitationByWorker = new Map<string, InvitationSummary>();
  for (const inv of invitations) {
    if (!latestInvitationByWorker.has(inv.worker_id)) {
      latestInvitationByWorker.set(inv.worker_id, inv);
    }
  }

  // Real per-worker payroll data (plan Step 12c — resolves the previously
  // index-fabricated values; see team/page.tsx for the queries). Sources,
  // mirroring apps/mobile's advances.tsx + lib/salaryCycle.ts conventions:
  //   - attendance: weighted attended days (present=1, half_day=0.5) from
  //     attendance_effective (0036) over the current Monday-start cycle,
  //     as a % of cycle days elapsed.
  //   - currentProject: project on the worker's latest dispatch_assignments
  //     row (0035) within the last 30 days, else '—'.
  //   - salaryAdvance: approved advances (0019) since the cycle started.
  const displayRows = useMemo<WorkerRow[]>(() => {
    return rows.map((worker) => {
      const invitation = latestInvitationByWorker.get(worker.id);
      const statusLabel = worker.user_id
        ? 'Actif'
        : invitation?.status === 'pending'
          ? 'Invitation envoyée'
          : invitation?.status === 'expired'
            ? 'Invitation expirée'
            : 'Aucune invitation';

      return {
        ...worker,
        profession: worker.trade ?? 'Main-d’œuvre générale',
        attendance: attendanceByWorker[worker.id] ?? 0,
        currentProject: currentProjectByWorker[worker.id] ?? '—',
        salaryAdvance: salaryAdvanceByWorker[worker.id] ?? 0,
        statusLabel,
      };
    });
  }, [
    rows,
    latestInvitationByWorker,
    attendanceByWorker,
    currentProjectByWorker,
    salaryAdvanceByWorker,
  ]);

  // §2.7 global search — clicking a "worker" result in the top-bar
  // dropdown deep-links to the worker's addressable detail page (§2.9).
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;
    const match = displayRows.find((w) => w.id === highlightId);
    if (match) router.push(`/team/${match.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, displayRows]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.full_name, row.phone ?? '', row.profession, row.currentProject].some((value) =>
          value.toLowerCase().includes(lower),
        );
      const matchesTrade = tradeFilter === 'all' || row.profession === tradeFilter;
      return matchesSearch && matchesTrade;
    });
  }, [displayRows, query, tradeFilter]);

  async function handleDeleteWorker() {
    if (deleteTarget === null) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteWorker(target.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== target.id));
      setNotice(`${target.full_name} a été déplacé vers la corbeille.`);
      setDeleteTarget(null);
    });
  }

  const columns: DataTableColumn<WorkerRow>[] = [
    {
      key: 'name',
      header: 'Ouvrier',
      render: (w) => (
        <div className="flex items-center gap-3">
          <Avatar name={w.full_name} />
          <div>
            <div className="font-medium text-neutral-900">{w.full_name}</div>
            <div className="text-xs text-neutral-500">{w.profession}</div>
          </div>
        </div>
      ),
      sortValue: (w) => w.full_name,
    },
    {
      key: 'phone',
      header: 'Téléphone',
      render: (w) => w.phone ?? '—',
      sortValue: (w) => w.phone ?? '',
    },
    {
      key: 'attendance',
      header: 'Présence',
      render: (w) => (
        <div className="min-w-[150px]">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>{w.attendance}%</span>
            <span>{w.currentProject}</span>
          </div>
          <ProgressBar value={w.attendance} tone={w.attendance > 85 ? 'success' : 'accent'} />
        </div>
      ),
      sortValue: (w) => w.attendance,
    },
    {
      key: 'daily_rate',
      header: 'Taux journalier',
      render: (w) => (w.daily_rate != null ? `${w.daily_rate} TND` : '—'),
      sortValue: (w) => w.daily_rate ?? 0,
      align: 'right',
    },
    {
      key: 'salaryAdvance',
      header: 'Avance',
      render: (w) => `${w.salaryAdvance.toLocaleString('fr-TN')} TND`,
      sortValue: (w) => w.salaryAdvance,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (w) => {
        if (w.user_id) {
          return <StatusBadge variant="success">Actif</StatusBadge>;
        }
        const invitation = latestInvitationByWorker.get(w.id);
        if (!invitation) {
          return <StatusBadge variant="neutral">Aucune invitation</StatusBadge>;
        }
        return (
          <StatusBadge variant={STATUS_VARIANT[invitation.status]}>
            {STATUS_LABEL[invitation.status]}
          </StatusBadge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (w) => (
        <div className="flex items-center justify-end gap-1.5">
          <IconActionButton
            icon={EyeIcon}
            label={`Voir le détail de ${w.full_name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/team/${w.id}`);
            }}
          />
          <IconActionButton
            icon={PencilSimpleIcon}
            label={`Modifier ${w.full_name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', worker: w });
            }}
          />
          <IconActionButton
            icon={TrashIcon}
            label={`Supprimer ${w.full_name}`}
            tone="danger"
            size="sm"
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteError(null);
              setDeleteTarget(w);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <PageHero
        eyebrow="Équipe"
        title="Équipe"
        description="Suivez les ouvriers, la présence, les avances sur salaire et l’affectation aux chantiers."
        actions={
          <Button onClick={() => setModalState({ mode: 'invite' })}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Inviter un ouvrier
          </Button>
        }
      />

      <SectionCard
        title="Liste des ouvriers"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Rechercher un ouvrier" />
            <FilterSelect
              aria-label="Filtrer par profession"
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              options={[
                { value: 'all', label: 'Toutes les professions' },
                ...Array.from(new Set(displayRows.map((worker) => worker.profession))).map(
                  (profession) => ({ value: profession, label: profession }),
                ),
              ]}
            />
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Ouvriers
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Actifs
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((worker) => worker.user_id).length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Présence
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {Math.round(
                filteredRows.reduce((sum, worker) => sum + worker.attendance, 0) /
                  Math.max(1, filteredRows.length),
              )}
              %
            </p>
            {/* Doc 05 §1.7i — Compact Metric: this is the canonical
                reference ("Équipe's presence bar") the audit itself
                points to. A bare percentage next to identical stat cards
                was the repetition the audit flagged; the bar makes this
                one read as a proportion, not just another number. */}
            <div className="mt-3">
              <ProgressBar
                value={Math.round(
                  filteredRows.reduce((sum, worker) => sum + worker.attendance, 0) /
                    Math.max(1, filteredRows.length),
                )}
                tone="success"
              />
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Avances
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows
                .reduce((sum, worker) => sum + worker.salaryAdvance, 0)
                .toLocaleString('fr-TN')}{' '}
              TND
            </p>
          </Card>
        </div>

        <div className="mt-5">
          {filteredRows.length === 0 ? (
            <EmptyState
              icon={HardHatIcon}
              title="Aucun ouvrier ne correspond à vos filtres"
              description="Affinez moins la recherche ou effacez le filtre de profession."
              actionLabel="Effacer les filtres"
              onAction={() => {
                setQuery('');
                setTradeFilter('all');
              }}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredRows}
              getRowId={(w) => w.id}
              onRowClick={(w) => router.push(`/team/${w.id}`)}
            />
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Retirer ${deleteTarget.full_name} de l’équipe ?` : ''}
        description={
          deleteTarget ? 'L’ouvrier sera retiré de l’équipe et déplacé vers la corbeille.' : ''
        }
        confirmLabel="Retirer"
        destructive
        loading={isPending}
        onConfirm={() => void handleDeleteWorker()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      >
        {deleteError && (
          <p className="text-danger mt-2 text-sm">
            Impossible de retirer l’ouvrier : {deleteError}
          </p>
        )}
      </ConfirmDialog>

      {modalState.mode === 'invite' && (
        <WorkerFormModal onClose={() => setModalState({ mode: 'closed' })} />
      )}
      {modalState.mode === 'edit' && (
        <WorkerFormModal
          worker={modalState.worker}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </div>
  );
}

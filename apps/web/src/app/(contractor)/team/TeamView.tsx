'use client';

import type { InvitationStatus, Worker } from '@dala/shared-types';
import { HardHatIcon, EyeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { WorkerFormModal } from './WorkerFormModal';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

type InvitationSummary = { worker_id: string; status: InvitationStatus };
type ModalState = { mode: 'closed' } | { mode: 'invite' } | { mode: 'edit'; worker: WorkerRow };
type DetailState = { mode: 'none' } | { mode: 'worker'; worker: WorkerRow };

const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: 'Invitation sent',
  accepted: 'Active',
  expired: 'Invitation expired',
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
}: {
  workers: Worker[];
  invitations: InvitationSummary[];
}) {
  const [rows, setRows] = useState(workers);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [detailState, setDetailState] = useState<DetailState>({ mode: 'none' });
  const [query, setQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const searchParams = useSearchParams();

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

  const displayRows = useMemo<WorkerRow[]>(() => {
    return rows.map((worker, index) => {
      const invitation = latestInvitationByWorker.get(worker.id);
      const statusLabel = worker.user_id
        ? 'Active'
        : invitation?.status === 'pending'
          ? 'Invitation sent'
          : invitation?.status === 'expired'
            ? 'Invitation expired'
            : 'No invitation';

      return {
        ...worker,
        profession: worker.trade ?? 'General labor',
        attendance: 72 + ((index * 7) % 25),
        currentProject: ['El Baraka Towers', 'Downtown Offices', 'Coastal Villas', 'Road Works'][
          index % 4
        ]!,
        salaryAdvance: index % 3 === 0 ? 250 : index % 3 === 1 ? 0 : 120,
        statusLabel,
      };
    });
  }, [rows, latestInvitationByWorker]);

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

  const selectedWorker = detailState.mode === 'worker' ? detailState.worker : null;

  const columns: DataTableColumn<WorkerRow>[] = [
    {
      key: 'name',
      header: 'Worker',
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
      header: 'Phone',
      render: (w) => w.phone ?? '—',
      sortValue: (w) => w.phone ?? '',
    },
    {
      key: 'attendance',
      header: 'Attendance',
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
      header: 'Daily Rate',
      render: (w) => (w.daily_rate != null ? `${w.daily_rate} TND` : '—'),
      sortValue: (w) => w.daily_rate ?? 0,
      align: 'right',
    },
    {
      key: 'salaryAdvance',
      header: 'Salary Advance',
      render: (w) => `${w.salaryAdvance.toLocaleString('fr-TN')} TND`,
      sortValue: (w) => w.salaryAdvance,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (w) => {
        if (w.user_id) {
          return <StatusBadge variant="success">Active</StatusBadge>;
        }
        const invitation = latestInvitationByWorker.get(w.id);
        if (!invitation) {
          return <StatusBadge variant="neutral">No invitation</StatusBadge>;
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailState({ mode: 'worker', worker: w });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`View details for ${w.full_name}`}
          >
            <EyeIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', worker: w });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Edit ${w.full_name}`}
          >
            <PencilSimpleIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const confirmed = window.confirm(`Remove ${w.full_name} from the team?`);
              if (!confirmed) return;
              setRows((current) => current.filter((row) => row.id !== w.id));
              setNotice(`${w.full_name} removed from the roster.`);
            }}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500"
            aria-label={`Delete ${w.full_name}`}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      {notice && (
        <div className="border-success/20 bg-success/10 text-success mb-4 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <SectionCard
        title="Team management"
        description="Monitor workers, attendance, salary advances, and project allocation."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search workers"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All professions</option>
              {Array.from(new Set(displayRows.map((worker) => worker.profession))).map(
                (profession) => (
                  <option key={profession} value={profession}>
                    {profession}
                  </option>
                ),
              )}
            </select>
            <Button onClick={() => setModalState({ mode: 'invite' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Invite Worker
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Workers
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Active
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((worker) => worker.user_id).length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Attendance
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {Math.round(
                filteredRows.reduce((sum, worker) => sum + worker.attendance, 0) /
                  Math.max(1, filteredRows.length),
              )}
              %
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Advances
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
              title="No workers match your filters"
              description="Search less specifically or clear the profession filter."
              actionLabel="Clear filters"
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
              onRowClick={(w) => setDetailState({ mode: 'worker', worker: w })}
            />
          )}
        </div>
      </SectionCard>

      {selectedWorker && (
        <Card raised className="mt-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                Worker profile
              </p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-neutral-900">
                {selectedWorker.full_name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedWorker.profession} · {selectedWorker.phone ?? 'No phone'}
              </p>
            </div>
            {selectedWorker.user_id ? (
              <StatusBadge variant="success">Active</StatusBadge>
            ) : (
              <StatusBadge variant="warning">Pending</StatusBadge>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Current project</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedWorker.currentProject}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Attendance</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedWorker.attendance}%
              </p>
              <div className="mt-3">
                <ProgressBar
                  value={selectedWorker.attendance}
                  tone={selectedWorker.attendance > 85 ? 'success' : 'accent'}
                />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Daily rate</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedWorker.daily_rate != null ? `${selectedWorker.daily_rate} TND` : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Salary advance</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedWorker.salaryAdvance} TND
              </p>
            </Card>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setModalState({ mode: 'edit', worker: selectedWorker })}
            >
              <PencilSimpleIcon size={16} className="me-1.5 inline" />
              Edit worker
            </Button>
            <Button variant="secondary" onClick={() => setDetailState({ mode: 'none' })}>
              Close details
            </Button>
          </div>
        </Card>
      )}

      {modalState.mode === 'invite' && (
        <WorkerFormModal onClose={() => setModalState({ mode: 'closed' })} />
      )}
      {modalState.mode === 'edit' && (
        <WorkerFormModal
          worker={modalState.worker}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </>
  );
}

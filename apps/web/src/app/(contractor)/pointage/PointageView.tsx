'use client';

import type { Project, Worker, AttendanceRecord } from '@dala/shared-types';
import { Button, Card, EmptyState, IconStatCard, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  MinusCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { saveManualAttendance } from './actions';

type AttendanceStatus = 'present' | 'absent' | 'half_day';

type WorkerRow = Worker & {
  effectiveAttendance: AttendanceStatus | null;
  source: AttendanceRecord['source'] | null;
  projectId: string;
  absenceReason: string;
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  half_day: 'Demi-journée',
};

const STATUS_VARIANT: Record<AttendanceStatus, 'success' | 'danger' | 'warning'> = {
  present: 'success',
  absent: 'danger',
  half_day: 'warning',
};

export function PointageView({
  date,
  workers,
  projects,
  attendanceRecords,
}: {
  date: string;
  workers: Worker[];
  projects: Project[];
  attendanceRecords: AttendanceRecord[];
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(date);
  const [rows, setRows] = useState<WorkerRow[]>(() => buildRows(workers, attendanceRecords));
  const [pendingWorkerId, setPendingWorkerId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  const projectOptions = useMemo(
    () =>
      projects
        .filter((project) => project.status === 'active')
        .map((project) => ({ id: project.id, name: project.name })),
    [projects],
  );

  function openDate(value: string) {
    router.push(`/pointage?date=${value}`);
  }

  function updateRow(workerId: string, patch: Partial<WorkerRow>) {
    setRows((current) => current.map((row) => (row.id === workerId ? { ...row, ...patch } : row)));
  }

  function buildPayload(worker: WorkerRow, status: AttendanceStatus) {
    return {
      worker_id: worker.id,
      record_date: selectedDate,
      status,
      project_id: worker.projectId || undefined,
      absence_reason: status === 'absent' ? worker.absenceReason || undefined : undefined,
    };
  }

  function saveRow(worker: WorkerRow, status: AttendanceStatus) {
    setPendingWorkerId(worker.id);
    setNotice(null);
    startTransition(async () => {
      const result = await saveManualAttendance(buildPayload(worker, status));
      if (!result.success) {
        setNotice(result.error);
        setPendingWorkerId(null);
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === worker.id
            ? { ...row, effectiveAttendance: status, source: 'manual_pointage' }
            : row,
        ),
      );
      setPendingWorkerId(null);
      router.refresh();
    });
  }

  function markAllPresent() {
    setNotice(null);
    startTransition(async () => {
      const results = await Promise.all(
        rows.map((row) =>
          saveManualAttendance({
            worker_id: row.id,
            record_date: selectedDate,
            status: 'present',
            project_id: row.projectId || undefined,
          }),
        ),
      );

      const firstError = results.find((result) => !result.success);
      if (firstError && !firstError.success) {
        setNotice(firstError.error);
        return;
      }

      setRows((current) =>
        current.map((row) => ({
          ...row,
          effectiveAttendance: 'present',
          source: 'manual_pointage',
        })),
      );
      setNotice(`${rows.length} ouvrier(s) marqués présents.`);
      router.refresh();
    });
  }

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.effectiveAttendance) {
          acc[row.effectiveAttendance] += 1;
        } else {
          acc.unset += 1;
        }
        return acc;
      },
      { present: 0, absent: 0, half_day: 0, unset: 0 },
    );
  }, [rows]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {notice && (
        <div className="border-accent-200 bg-accent-50 text-accent-700 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <PageHero
        icon={ClockCounterClockwiseIcon}
        title="Présence manuelle"
        description="Saisissez la présence d’une journée sans dépendre d’un dispatch. Les pointages manuels restent prioritaires sur les check-ins automatiques."
        actions={
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 shadow-[0_4px_14px_rgba(17,19,24,0.04)]">
              <CalendarBlankIcon size={18} className="text-neutral-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  openDate(event.target.value);
                }}
                className="border-0 bg-transparent p-0 text-sm outline-none"
              />
            </div>
            <Button variant="secondary" onClick={markAllPresent} loading={isPending}>
              Marquer tous présents
            </Button>
            <Link href="/pointage/history">
              <Button variant="secondary" fullWidth={false}>
                <ClockCounterClockwiseIcon size={16} className="me-1.5 inline" />
                Historique
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <IconStatCard icon={CheckCircleIcon} tone="success" label="Présents" value={summary.present} />
        <IconStatCard icon={XCircleIcon} tone="danger" label="Absents" value={summary.absent} />
        <IconStatCard
          icon={MinusCircleIcon}
          tone="warning"
          label="Demi-journées"
          value={summary.half_day}
        />
        <IconStatCard
          icon={CalendarBlankIcon}
          tone="neutral"
          label="Non renseignés"
          value={summary.unset}
        />
      </div>

      <SectionCard
        title="Ouvriers actifs"
        description="Un pointage par ouvrier et par jour. Le projet associé sert uniquement au contexte de coût de main-d’œuvre."
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarBlankIcon}
            title="Aucun ouvrier dans l’organisation"
            description="Ajoutez d’abord des ouvriers pour pouvoir saisir la présence manuelle."
            actionLabel="Ouvrir l’équipe"
            actionHref="/team"
          />
        ) : (
          <div className="space-y-3">
            {rows.map((worker) => {
              const effective = worker.effectiveAttendance;
              return (
                <Card key={worker.id} className="p-4" raised>
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-medium text-neutral-900">{worker.full_name}</p>
                        {effective ? (
                          <StatusBadge variant={STATUS_VARIANT[effective]}>
                            {STATUS_LABEL[effective]}
                          </StatusBadge>
                        ) : (
                          <StatusBadge variant="neutral">Non renseigné</StatusBadge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-neutral-500">
                        {worker.trade ?? 'Sans métier renseigné'}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {worker.source === 'manual_pointage'
                          ? 'Source : pointage manuel'
                          : worker.source === 'dispatch_checkin'
                            ? 'Source : check-in dispatch'
                            : 'Aucune saisie'}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                        Chantier associé
                      </label>
                      <select
                        value={worker.projectId}
                        onChange={(e) => updateRow(worker.id, { projectId: e.target.value })}
                        className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-sm outline-none"
                      >
                        <option value="">Aucun chantier</option>
                        {projectOptions.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={worker.effectiveAttendance === 'present' ? 'primary' : 'secondary'}
                        onClick={() => saveRow(worker, 'present')}
                        loading={isPending && pendingWorkerId === worker.id}
                      >
                        <CheckCircleIcon size={16} className="me-1 inline" />
                        Présent
                      </Button>
                      <Button
                        type="button"
                        variant={
                          worker.effectiveAttendance === 'half_day' ? 'primary' : 'secondary'
                        }
                        onClick={() => saveRow(worker, 'half_day')}
                        loading={isPending && pendingWorkerId === worker.id}
                      >
                        <MinusCircleIcon size={16} className="me-1 inline" />
                        Demi-journée
                      </Button>
                      <Button
                        type="button"
                        variant={worker.effectiveAttendance === 'absent' ? 'primary' : 'secondary'}
                        onClick={() => saveRow(worker, 'absent')}
                        loading={isPending && pendingWorkerId === worker.id}
                      >
                        <XCircleIcon size={16} className="me-1 inline" />
                        Absent
                      </Button>
                    </div>
                  </div>
                  {worker.effectiveAttendance === 'absent' && (
                    <div className="mt-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                        Motif de l’absence (facultatif)
                      </label>
                      <input
                        value={worker.absenceReason}
                        onChange={(e) => updateRow(worker.id, { absenceReason: e.target.value })}
                        onBlur={() => saveRow(worker, 'absent')}
                        placeholder="Ex. Maladie, congé, non justifiée…"
                        className="bg-neutral-0 mt-1.5 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-sm outline-none"
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function buildRows(workers: Worker[], records: AttendanceRecord[]): WorkerRow[] {
  const byWorker = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const current = byWorker.get(record.worker_id) ?? [];
    current.push(record);
    byWorker.set(record.worker_id, current);
  }

  return workers.map((worker) => {
    const sorted = (byWorker.get(worker.id) ?? []).sort((left, right) => {
      if (left.source === right.source) {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }
      return left.source === 'manual_pointage' ? -1 : 1;
    });
    const effective = sorted[0];

    return {
      ...worker,
      effectiveAttendance: (effective?.status as AttendanceStatus | undefined) ?? null,
      source: effective?.source ?? null,
      projectId: effective?.project_id ?? '',
      absenceReason: effective?.absence_reason ?? '',
    };
  });
}

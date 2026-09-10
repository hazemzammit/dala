'use client';

import type { AttendanceSource, AttendanceStatus, Worker } from '@dala/shared-types';
import { Card, EmptyState, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { ClockCounterClockwiseIcon, XIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  half_day: 'Demi-jour',
};

const STATUS_VARIANT: Record<AttendanceStatus, 'success' | 'danger' | 'warning'> = {
  present: 'success',
  absent: 'danger',
  half_day: 'warning',
};

const SOURCE_LABEL: Record<string, string> = {
  manual_pointage: 'Pointage manuel',
  dispatch_checkin: 'Arrivée (dispatch)',
};

interface RawRecord {
  id: string;
  worker_id: string;
  record_date: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  recorded_by: string | null;
  absence_reason: string | null;
  created_at: string;
}

interface EffectiveRow {
  worker_id: string;
  record_date: string;
  status: AttendanceStatus;
}

interface DayEntry {
  workerId: string;
  date: string;
  effectiveStatus: AttendanceStatus;
  rows: RawRecord[]; // every attendance_records row for this worker+day, oldest first
}

interface AttendanceHistoryViewProps {
  windowDays: number;
  workers: Worker[];
  effectiveRows: EffectiveRow[];
  rawRows: RawRecord[];
  recordedByName: Record<string, string>;
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('fr-TN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function AttendanceHistoryView({
  windowDays,
  workers,
  effectiveRows,
  rawRows,
  recordedByName,
}: AttendanceHistoryViewProps) {
  const [filterWorkerId, setFilterWorkerId] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<DayEntry | null>(null);

  const workerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    workers.forEach((w) => {
      map[w.id] = w.full_name;
    });
    return map;
  }, [workers]);

  const entries = useMemo<DayEntry[]>(() => {
    const rawByWorkerDate = new Map<string, RawRecord[]>();
    rawRows.forEach((r) => {
      const key = `${r.worker_id}|${r.record_date}`;
      const list = rawByWorkerDate.get(key) ?? [];
      list.push(r);
      rawByWorkerDate.set(key, list);
    });

    const built = effectiveRows.map((r) => {
      const key = `${r.worker_id}|${r.record_date}`;
      return {
        workerId: r.worker_id,
        date: r.record_date,
        effectiveStatus: r.status,
        rows: rawByWorkerDate.get(key) ?? [],
      };
    });
    built.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
    return built;
  }, [effectiveRows, rawRows]);

  const visibleEntries = useMemo(() => {
    if (!filterWorkerId) return entries;
    return entries.filter((e) => e.workerId === filterWorkerId);
  }, [entries, filterWorkerId]);

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, DayEntry[]>();
    visibleEntries.forEach((e) => {
      const list = groups.get(e.date) ?? [];
      list.push(e);
      groups.set(e.date, list);
    });
    return Array.from(groups.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, dayEntries]) => ({ date, dayEntries }));
  }, [visibleEntries]);

  return (
    <>
      <PageHero
        eyebrow="Pointage"
        title="Historique de pointage"
        description={`Chaque pointage des ${windowDays} derniers jours, y compris les corrections. Un jour "Corrigé" affiche chaque ligne enregistrée, pas seulement le résultat final.`}
      />

      <SectionCard
        title="Historique"
        description="Groupé par jour, du plus récent au plus ancien."
        actions={
          workers.length > 1 ? (
            <select
              value={filterWorkerId ?? 'all'}
              onChange={(e) => setFilterWorkerId(e.target.value === 'all' ? null : e.target.value)}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Tous les ouvriers</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {groupedByDate.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwiseIcon}
            title="Aucun historique"
            description={`Aucune donnée de pointage sur les ${windowDays} derniers jours.`}
          />
        ) : (
          <div className="flex flex-col gap-5">
            {groupedByDate.map(({ date, dayEntries }) => (
              <div key={date} className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  {formatDateLabel(date)}
                </p>
                <div className="flex flex-col gap-2">
                  {dayEntries.map((entry) => {
                    const corrected = entry.rows.length > 1;
                    const lastRow = entry.rows[entry.rows.length - 1];
                    return (
                      <div
                        key={`${entry.workerId}|${entry.date}`}
                        className={`flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 px-4 py-3 ${
                          corrected ? 'cursor-pointer hover:border-neutral-300' : ''
                        }`}
                        onClick={corrected ? () => setDetailEntry(entry) : undefined}
                      >
                        <div className="flex flex-1 flex-col gap-0.5">
                          <p className="text-sm font-semibold text-neutral-900">
                            {workerNameById[entry.workerId] ?? '—'}
                          </p>
                          <div className="flex items-center gap-2">
                            <StatusBadge variant={STATUS_VARIANT[entry.effectiveStatus]}>
                              {STATUS_LABEL[entry.effectiveStatus]}
                            </StatusBadge>
                            <span className="text-xs text-neutral-500">
                              {lastRow ? (SOURCE_LABEL[lastRow.source] ?? lastRow.source) : '—'}
                            </span>
                          </div>
                          {lastRow?.recorded_by && (
                            <p className="text-[11.5px] text-neutral-500">
                              Par {recordedByName[lastRow.recorded_by] ?? 'Non renseigné'}
                            </p>
                          )}
                        </div>
                        {corrected && <StatusBadge variant="info">Corrigé</StatusBadge>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {detailEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="w-full max-w-lg p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                {workerNameById[detailEntry.workerId] ?? ''} · {formatDateLabel(detailEntry.date)}
              </h2>
              <button
                onClick={() => setDetailEntry(null)}
                className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <p className="mb-3 text-sm text-neutral-500">
              La ligne la plus récente ci-dessous (en bas) est celle retenue — un pointage manuel
              l&apos;emporte toujours sur une arrivée dispatch pour le même jour.
            </p>

            <div className="flex flex-col gap-2">
              {detailEntry.rows.map((row, idx) => (
                <div
                  key={row.id}
                  className={`rounded-control bg-neutral-25 flex flex-col gap-0.5 p-3 ${
                    idx === detailEntry.rows.length - 1 ? 'border-accent-600 border' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-neutral-900">
                      {STATUS_LABEL[row.status]}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(row.created_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {SOURCE_LABEL[row.source] ?? row.source}
                    {row.recorded_by
                      ? ` · ${recordedByName[row.recorded_by] ?? 'Non renseigné'}`
                      : ''}
                  </p>
                  {row.absence_reason && (
                    <p className="text-xs text-neutral-500">Motif : {row.absence_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

import type { AttendanceStatus, Worker } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { CaretRightIcon, ClockCounterClockwiseIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/components/attendance/AttendanceHistory.tsx
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.1 step 2) — the attendance history view.
 *
 * DESIGN CHOICE, documented per the plan's own explicit instruction:
 * a reverse-chronological, DATE-GROUPED list (not a calendar-month grid).
 * The plan frames the trade-off as "month-at-a-glance" (did I already do
 * pointage this week) vs. "per-worker timeline" (why does this worker's
 * pay look off), and explicitly allows combining both via a worker filter
 * on top of one view if that's reasonable effort — which is what this
 * does, via the optional `workerId`/`lockToWorker` props below, rather
 * than building two structurally different screens.
 *
 * A calendar GRID was considered and rejected: this phase's own §1.1 step
 * 2 requirement is that a day with more than one `attendance_records` row
 * must be genuinely auditable ("not just see the final answer restated") —
 * that means showing source, recorded_by, and every individual row's
 * timestamp per conflict day. A grid cell is too small to carry that; it
 * would need its own expand-to-list interaction anyway, at which point
 * it's not saving anything over starting from a list. A date-grouped list
 * ALSO answers "did I do pointage this week" reasonably well — each date
 * header groups every worker's entry for that day together, so scanning
 * the last few date headers gives the same at-a-glance read a grid's top
 * row would, without a second, structurally different UI to build and
 * maintain.
 *
 * `workerId`/`lockToWorker`: when set (worker/[id].tsx's Pointage tab),
 * this component IS the plan's own "per-worker mode" — scoped to one
 * worker's attendance_effective query, worker-filter chip row hidden
 * entirely (nothing to filter when there's only one worker in scope).
 *
 * Data shape: reads BOTH `attendance_effective` (0036 — the resolved,
 * "what would pointage.tsx show" answer per worker/day) AND raw
 * `attendance_records` for the same range (to detect and expose a
 * conflict day's full row history). This is read-only — no write path;
 * the append-only insert in pointage.tsx is unchanged (see that file's
 * own header for why a "correction" needs no new write logic at all).
 *
 * `recorded_by` resolution, disclosed rather than silently assumed
 * useful: every current write path in this app (pointage.tsx's
 * handleSave, (worker)/home.tsx's handleArrived) hardcodes
 * `record.recordedBy = null` — confirmed by reading both files directly
 * before writing this component. The profiles join below is implemented
 * correctly and will resolve a name the moment any future write path
 * starts setting this column, but as of this phase it will always render
 * as the "Non renseigné" fallback. Not removed/simplified away, since the
 * plan explicitly asks for this resolution and a future write path
 * setting the column should light this up for free.
 *
 * Window: last 60 days from today. An unbounded query isn't appropriate
 * for a screen a contractor might open in the field; 60 days comfortably
 * covers "this pay cycle" and "last pay cycle" for an audit look-back
 * without needing pagination this phase didn't ask for.
 */
const STATUS_META: Record<AttendanceStatus, { label: string; color: string }> = {
  present: { label: 'Présent', color: '$success' },
  absent: { label: 'Absent', color: '$danger' },
  half_day: { label: 'Demi-jour', color: '$warning' },
};

const SOURCE_LABEL: Record<string, string> = {
  manual_pointage: 'Pointage manuel',
  dispatch_checkin: 'Arrivée (dispatch)',
};

const WINDOW_DAYS = 60;

interface RawRecord {
  id: string;
  worker_id: string;
  record_date: string;
  status: AttendanceStatus;
  source: string;
  recorded_by: string | null;
  absence_reason: string | null;
  created_at: string;
}

interface DayEntry {
  workerId: string;
  date: string;
  effectiveStatus: AttendanceStatus;
  rows: RawRecord[]; // every attendance_records row for this worker+day, oldest first
}

interface AttendanceHistoryProps {
  /** Locks the whole view to one worker — worker/[id].tsx's Pointage tab. */
  workerId?: string;
  /** Hides the "Tous / <worker>" filter row entirely (used with workerId). */
  lockToWorker?: boolean;
}

function windowStartISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - (WINDOW_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('fr-TN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function AttendanceHistory({ workerId, lockToWorker = false }: AttendanceHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [recordedByName, setRecordedByName] = useState<Record<string, string>>({});
  const [filterWorkerId, setFilterWorkerId] = useState<string | null>(workerId ?? null);
  const [detailEntry, setDetailEntry] = useState<DayEntry | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        const orgId = await getActiveOrgId();
        if (!orgId) {
          setWorkers([]);
          setEntries([]);
          return;
        }
        const start = windowStartISO();
        const end = todayISO();

        let effectiveQuery = supabase
          .from('attendance_effective')
          .select('worker_id, record_date, status')
          .eq('org_id', orgId)
          .gte('record_date', start)
          .lte('record_date', end);
        let rawQuery = supabase
          .from('attendance_records')
          .select(
            'id, worker_id, record_date, status, source, recorded_by, absence_reason, created_at',
          )
          .eq('org_id', orgId)
          .gte('record_date', start)
          .lte('record_date', end)
          .order('created_at', { ascending: true });

        if (workerId) {
          effectiveQuery = effectiveQuery.eq('worker_id', workerId);
          rawQuery = rawQuery.eq('worker_id', workerId);
        }

        const [{ data: workerRows }, { data: effectiveRows }, { data: rawRows }] =
          await Promise.all([
            workerId
              ? supabase.from('workers').select('*').eq('id', workerId).limit(1)
              : supabase.from('workers').select('*').eq('org_id', orgId).order('full_name'),
            effectiveQuery,
            rawQuery,
          ]);

        setWorkers((workerRows as Worker[] | null) ?? []);

        const rawByWorkerDate = new Map<string, RawRecord[]>();
        (rawRows ?? []).forEach((r: any) => {
          const key = `${r.worker_id}|${r.record_date}`;
          const list = rawByWorkerDate.get(key) ?? [];
          list.push(r as RawRecord);
          rawByWorkerDate.set(key, list);
        });

        const built: DayEntry[] = (effectiveRows ?? []).map((r: any) => {
          const key = `${r.worker_id}|${r.record_date}`;
          return {
            workerId: r.worker_id,
            date: r.record_date,
            effectiveStatus: r.status as AttendanceStatus,
            rows: rawByWorkerDate.get(key) ?? [],
          };
        });
        built.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
        setEntries(built);

        // recorded_by -> name resolution (see file header: currently always
        // null in practice, implemented for when a future write path sets it).
        const distinctRecordedBy = Array.from(
          new Set(
            (rawRows ?? []).map((r: any) => r.recorded_by).filter((v: unknown): v is string => !!v),
          ),
        );
        if (distinctRecordedBy.length > 0) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', distinctRecordedBy);
          const map: Record<string, string> = {};
          (profileRows ?? []).forEach((p: any) => {
            if (p.full_name) map[p.id] = p.full_name;
          });
          setRecordedByName(map);
        } else {
          setRecordedByName({});
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workerId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const workerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    workers.forEach((w) => {
      map[w.id] = w.full_name;
    });
    return map;
  }, [workers]);

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

  if (loading) {
    return <SkeletonList rows={6} />;
  }

  if (error) {
    return <ErrorState illustration="warning" onRetry={() => void load()} />;
  }

  return (
    <YStack flex={1}>
      {!lockToWorker && workers.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <XStack gap="$2">
            <FilterChip
              label="Tous"
              active={filterWorkerId === null}
              onPress={() => setFilterWorkerId(null)}
            />
            {workers.map((w) => (
              <FilterChip
                key={w.id}
                label={w.full_name}
                active={filterWorkerId === w.id}
                onPress={() => setFilterWorkerId(w.id)}
              />
            ))}
          </XStack>
        </ScrollView>
      )}

      {groupedByDate.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwiseIcon}
          title="Aucun historique"
          description={`Aucune donnée de pointage sur les ${WINDOW_DAYS} derniers jours.`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
          }
        >
          <YStack gap="$4">
            {groupedByDate.map(({ date, dayEntries }) => (
              <YStack key={date} gap="$2">
                <Text
                  fontSize={12.5}
                  fontWeight="600"
                  color="$neutral500"
                  textTransform="uppercase"
                >
                  {formatDateLabel(date)}
                </Text>
                <YStack gap="$2">
                  {dayEntries.map((entry) => {
                    const meta = STATUS_META[entry.effectiveStatus];
                    const corrected = entry.rows.length > 1;
                    const lastRow = entry.rows[entry.rows.length - 1];
                    return (
                      <XStack
                        key={`${entry.workerId}|${entry.date}`}
                        backgroundColor="$neutral0"
                        borderRadius="$card"
                        padding="$3"
                        alignItems="center"
                        justifyContent="space-between"
                        onPress={corrected ? () => setDetailEntry(entry) : undefined}
                      >
                        <YStack flex={1} gap={2}>
                          {!lockToWorker && (
                            <Text fontSize={14} fontWeight="600">
                              {workerNameById[entry.workerId] ?? '—'}
                            </Text>
                          )}
                          <XStack alignItems="center" gap="$2">
                            <StatusBadge
                              variant={
                                entry.effectiveStatus === 'present'
                                  ? 'success'
                                  : entry.effectiveStatus === 'absent'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {meta.label}
                            </StatusBadge>
                            <Text fontSize={12} color="$neutral500">
                              {lastRow ? (SOURCE_LABEL[lastRow.source] ?? lastRow.source) : '—'}
                            </Text>
                          </XStack>
                          {lastRow?.recorded_by && (
                            <Text fontSize={11.5} color="$neutral500">
                              Par {recordedByName[lastRow.recorded_by] ?? 'Non renseigné'}
                            </Text>
                          )}
                        </YStack>
                        {corrected && (
                          <XStack alignItems="center" gap={4}>
                            <StatusBadge variant="info">Corrigé</StatusBadge>
                            <CaretRightIcon size={14} color="#8A8F98" />
                          </XStack>
                        )}
                      </XStack>
                    );
                  })}
                </YStack>
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      )}

      <Sheet
        visible={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        title={
          detailEntry
            ? `${workerNameById[detailEntry.workerId] ?? ''} · ${formatDateLabel(detailEntry.date)}`
            : 'Détail'
        }
      >
        {detailEntry && (
          <YStack gap="$3">
            <Text fontSize={13} color="$neutral500">
              {/* 0036's own precedence rule, restated for a human: manual
                  pointage wins over a dispatch check-in on the same day;
                  among same-source rows, the latest wins. Every row below
                  is shown oldest-first so the LAST row is the effective one. */}
              La ligne la plus récente ci-dessous (en bas) est celle retenue — un pointage manuel
              l&apos;emporte toujours sur une arrivée dispatch pour le même jour.
            </Text>
            {detailEntry.rows.map((row, idx) => (
              <YStack
                key={row.id}
                backgroundColor="$neutral25"
                borderRadius="$control"
                padding="$3"
                gap={2}
                borderWidth={idx === detailEntry.rows.length - 1 ? 1 : 0}
                borderColor="$accent600"
              >
                <XStack justifyContent="space-between">
                  <Text fontSize={14} fontWeight="600">
                    {STATUS_META[row.status].label}
                  </Text>
                  <Text fontSize={12} color="$neutral500">
                    {new Date(row.created_at).toLocaleString('fr-TN')}
                  </Text>
                </XStack>
                <Text fontSize={12.5} color="$neutral500">
                  {SOURCE_LABEL[row.source] ?? row.source}
                  {row.recorded_by
                    ? ` · ${recordedByName[row.recorded_by] ?? 'Non renseigné'}`
                    : ''}
                </Text>
                {row.absence_reason && (
                  <Text fontSize={12.5} color="$neutral500">
                    Motif : {row.absence_reason}
                  </Text>
                )}
              </YStack>
            ))}
          </YStack>
        )}
      </Sheet>
    </YStack>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <XStack
      paddingVertical={8}
      paddingHorizontal={14}
      borderRadius={999}
      backgroundColor={active ? '$accent600' : '$neutral0'}
      borderWidth={1}
      borderColor={active ? '$accent600' : '$neutral300'}
      onPress={onPress}
    >
      <Text fontSize={13.5} fontWeight="500" color={active ? 'white' : '$neutral900'}>
        {label}
      </Text>
    </XStack>
  );
}

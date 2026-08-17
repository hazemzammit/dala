import { color } from '@dala/design-tokens';
import type { AttendanceStatus, Worker } from '@dala/shared-types';
import { router, useFocusEffect } from 'expo-router';
import { ArrowCounterClockwiseIcon, CheckCircleIcon, UsersIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useToast } from '@/components/ui/Toast';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import AttendanceRecord from '@/db/models/AttendanceRecord';
import { runSync } from '@/db/sync';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/pointage.tsx
 *
 * Doc 02 §2.2a — manual attendance, independent of the dispatch board.
 * Date-scoped roster, 3-state toggle per worker, "Marquer tous présents"
 * bulk action.
 *
 * Doc 01 §1.14.3 — a manual entry here is NEVER silently overwritten by a
 * later dispatch check-in for the same worker/day: attendance_records is
 * append-only (no unique constraint on worker_id+record_date). The read
 * side's preference for manual_pointage on conflict is implemented once,
 * server-side, by the `attendance_effective` view (migration 0036) — this
 * screen prefills its toggle from that view, not from a raw, latest-wins
 * read over attendance_records. Writes still insert a new row here rather
 * than updating an old one (same append-only reasoning as ever) — the
 * view, not this screen's own ordering, is what decides which row wins on
 * a conflict day.
 *
 * PHASE 19 — `handleSave` writes locally first (one `attendance_records`
 * row per selected worker, via `createWithClientId`), then fires
 * `runSync()` in the background. The `attendance_effective` prefill read
 * in `load()` stays live — a contractor doing pointage is doing office/
 * end-of-day admin work, not a field action in a dead zone the way the
 * worker's own check-in is, so the read side wasn't a priority for this
 * pass. Same scope-boundary reasoning as `(worker)/home.tsx`.
 *
 * Phase 13 correction, stated plainly: before this migration, this screen's
 * own read WAS the latest-inserted row regardless of source, which could
 * show a dispatch check-in's status as "current" even on a day with an
 * earlier manual entry — the opposite of the intent this same comment
 * described. See 0036's header for the full audit of every screen this
 * affected, not just this one.
 *
 * UI/UX pass: this is the app's highest-frequency daily screen and was
 * previously the flattest — a plain 3-button SegmentedControl per row with
 * no summary of where the crew currently stands. Adds: a live counts strip
 * (Présents/Absents/Non pointés) above the list; pull-to-refresh (was
 * missing everywhere in the app); a swipe-right-to-mark-présent gesture per
 * row via `SwipeableRow`, additive to the existing tap-the-segment flow
 * rather than replacing it (some workers' status legitimately isn't
 * "présent" — a blanket swipe-only interaction would bias toward the wrong
 * default); and "Marquer tous présents" now snapshots the prior state and
 * offers a 5s "Annuler" instead of silently bulk-overwriting every row with
 * no way back.
 */
const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'present', label: 'Présent', color: '$success' },
  { value: 'absent', label: 'Absent', color: '$danger' },
  { value: 'half_day', label: 'Demi-jour', color: '$warning' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PointageScreen() {
  const toast = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<Record<
    string,
    AttendanceStatus | undefined
  > | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const date = todayISO();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: workerRows } = await supabase
      .from('workers')
      .select('*')
      .eq('org_id', org)
      .order('full_name');
    setWorkers(workerRows ?? []);

    // attendance_effective (0036) already resolves manual-vs-dispatch
    // conflicts server-side — one row per (worker_id, record_date), so no
    // client-side sort/dedup is needed here at all anymore.
    const { data: records } = await supabase
      .from('attendance_effective')
      .select('worker_id, status')
      .eq('org_id', org)
      .eq('record_date', date);

    const latestByWorker: Record<string, AttendanceStatus> = {};
    (records ?? []).forEach((r) => {
      latestByWorker[r.worker_id] = r.status as AttendanceStatus;
    });
    setStatuses(latestByWorker);
    setLoading(false);
    setRefreshing(false);
  }

  function setStatus(workerId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [workerId]: status }));
  }

  async function handleSave() {
    if (!orgId) return;
    const entries = Object.entries(statuses).filter(([, status]) => status !== undefined);
    if (entries.length === 0) {
      Alert.alert('Aucune modification', 'Sélectionnez au moins un statut avant de valider.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      await database.write(async () => {
        for (const [workerId, status] of entries) {
          await createWithClientId(
            database.get<AttendanceRecord>('attendance_records'),
            (record) => {
              record.orgId = orgId;
              record.workerId = workerId;
              record.projectId = null;
              record.recordDate = date;
              record.status = status as AttendanceStatus;
              record.source = 'manual_pointage';
              record.recordedBy = null;
            },
          );
        }
      });
      void runSync();
      haptics.confirm();
      Alert.alert('Pointage enregistré', `${entries.length} travailleur(s) mis à jour.`);
      router.back();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Erreur', e?.message ?? "Impossible d'enregistrer le pointage.");
    } finally {
      setSaving(false);
    }
  }

  function markAllPresent() {
    // Snapshot the pre-bulk state so the 5s undo window below can restore
    // it exactly — a bulk action affecting the whole crew shouldn't be a
    // one-way door with no way back if it was tapped by mistake.
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoSnapshot(statuses);
    const next: Record<string, AttendanceStatus> = {};
    workers.forEach((w) => {
      next[w.id] = 'present';
    });
    setStatuses(next);
    haptics.confirm();
    undoTimer.current = setTimeout(() => setUndoSnapshot(null), 5000);
  }

  function undoMarkAllPresent() {
    if (!undoSnapshot) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setStatuses(undoSnapshot);
    setUndoSnapshot(null);
    toast.info('Pointage restauré.');
  }

  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let halfDay = 0;
    workers.forEach((w) => {
      const s = statuses[w.id];
      if (s === 'present') present++;
      else if (s === 'absent') absent++;
      else if (s === 'half_day') halfDay++;
    });
    return { present, absent, halfDay, unset: workers.length - present - absent - halfDay };
  }, [workers, statuses]);

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={5} />
      </YStack>
    );
  }

  if (workers.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={UsersIcon}
          illustration="check-boxes"
          title="Aucun travailleur"
          description="Invitez d'abord des travailleurs depuis l'écran Équipe."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$1">
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Pointage
          </Text>
          <Text color="$accent600" fontSize={14} fontWeight="500" onPress={markAllPresent}>
            Marquer tous présents
          </Text>
        </XStack>
        <Text color="$neutral500" fontSize={13} marginBottom="$3">
          {date}
        </Text>

        {/* Live counts strip — was entirely absent; answers "where does the
            crew stand right now" at a glance instead of scanning every row. */}
        <XStack
          backgroundColor="$neutral0"
          borderRadius="$card"
          padding="$3"
          marginBottom="$3"
          gap="$2"
        >
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$success">
              {counts.present}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Présents
            </Text>
          </YStack>
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$danger">
              {counts.absent}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Absents
            </Text>
          </YStack>
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$warning">
              {counts.halfDay}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Demi-jour
            </Text>
          </YStack>
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$neutral500">
              {counts.unset}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Non pointés
            </Text>
          </YStack>
        </XStack>

        {undoSnapshot && (
          <XStack
            alignItems="center"
            justifyContent="space-between"
            backgroundColor="$accent50"
            borderRadius="$control"
            paddingVertical={10}
            paddingHorizontal={12}
            marginBottom="$3"
          >
            <XStack alignItems="center" gap="$2">
              <CheckCircleIcon size={16} weight="fill" color={color.accent[600]} />
              <Text fontSize={13} color="$accent700">
                Tous marqués présents.
              </Text>
            </XStack>
            <XStack
              alignItems="center"
              gap={4}
              onPress={undoMarkAllPresent}
              accessibilityRole="button"
            >
              <ArrowCounterClockwiseIcon size={14} weight="bold" color={color.accent[600]} />
              <Text fontSize={13} fontWeight="600" color="$accent600">
                Annuler
              </Text>
            </XStack>
          </XStack>
        )}

        <YStack gap="$2">
          {workers.map((worker) => {
            const alreadyPresent = statuses[worker.id] === 'present';
            return (
              <SwipeableRow
                key={worker.id}
                rightAction={
                  alreadyPresent
                    ? undefined
                    : {
                        label: 'Présent',
                        color: color.status.success,
                        icon: CheckCircleIcon,
                        onPress: () => {
                          haptics.confirm();
                          setStatus(worker.id, 'present');
                        },
                      }
                }
              >
                <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3" gap="$2">
                  <XStack alignItems="center" gap="$3">
                    <Avatar name={worker.full_name} />
                    <Text fontSize={15.5} fontWeight="600" flex={1}>
                      {worker.full_name}
                    </Text>
                  </XStack>
                  <SegmentedControl
                    value={statuses[worker.id] ?? ('' as AttendanceStatus)}
                    options={STATUS_OPTIONS}
                    onChange={(status) => setStatus(worker.id, status)}
                  />
                </YStack>
              </SwipeableRow>
            );
          })}
        </YStack>
      </ScrollView>

      <YStack padding="$4" backgroundColor="$neutral25">
        <Button onPress={handleSave} loading={saving}>
          Valider le pointage
        </Button>
      </YStack>
    </YStack>
  );
}

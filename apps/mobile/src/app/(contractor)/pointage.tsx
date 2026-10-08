import { color } from '@dala/design-tokens';
import type { AttendanceStatus, Worker } from '@dala/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  InfoIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, RefreshControl } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon3D } from '@/components/ui/Icon3D';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useToast } from '@/components/ui/Toast';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import AttendanceRecord from '@/db/models/AttendanceRecord';
import { runSync } from '@/db/sync';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { ABSENCE_REASON_OPTIONS } from '@/lib/pickerOptions';
import { getSignedUrlMap } from '@/lib/storage';
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
 *
 * IMPROVEMENT-PLAN PHASE 1 — one of two screens (with vehicles.tsx) chosen
 * for this phase's React Query migration; see that file's header for why
 * this pair. Two reads, two `useQuery`s:
 *
 *   - `['workers', orgId]` — the exact shared cache key the plan's own
 *     §5.1 example names; once team.tsx (or the future worker-detail hub,
 *     §1.6) adopts the same key in a later phase, an edit on one screen
 *     invalidates the other without a navigation event.
 *   - `['attendance', orgId, date]` — date-scoped, since a different date
 *     is a genuinely different data set, not a variant of the same one.
 *
 * NOT wrapped in `useQuery`: the local `statuses` toggle state itself —
 * that's in-progress user input, not server data. The subtle part: a
 * background refetch of `['attendance', orgId, date]` (e.g. the app
 * regains focus while this screen is still mounted) must NOT clobber
 * toggles the contractor has already made but not yet saved. `hasSeededRef`
 * below makes the server->local seed happen exactly once per screen visit
 * (reset on each `useFocusEffect` focus, matching the OLD `load()`
 * behavior of always starting from a clean server read on each visit),
 * not on every `attendanceQuery.data` change thereafter.
 *
 * `runSync()` after `handleSave` is UNCHANGED — still fire-and-forget by
 * design (the local-first write already succeeded and is what
 * `Alert.alert` below confirms). Its outcome is no longer silently
 * discarded, but that fix now lives at the `runSync()` level itself (see
 * `lib/syncStatus.ts` and `OfflineBanner.tsx`), not here — this screen
 * needed no sync-status code of its own to gain that visibility.
 *
 * `FlatList` replaces `ScrollView` + `.map()` over the worker roster, per
 * §6.1, since this screen is touched this phase anyway.
 *
 * IMPROVEMENT-PLAN PHASE 2 (§1.1 step 1) — the date was hardcoded to
 * `todayISO()`; now a `DatePicker` (reusing the existing component per the
 * plan's own guardrail) lets the contractor open any PAST date
 * (`maximumDate={new Date()}` — backward-only, capped at today, exactly as
 * specced). Scoped to exactly step 1: no history view, no explicit
 * "correction" labeling/UI, no absence-reason field — those are §1.1 steps
 * 2–4, later phases. The append-only insert in `handleSave` below is
 * UNCHANGED — it already reads whichever date is selected via the `date`
 * state variable and always INSERTs a new `attendance_records` row, never
 * updates one, so opening a past date and saving is already, structurally,
 * "add a correction row" — this step doesn't need new logic for that, only
 * the ability to select the date in the first place.
 *
 * `hasSeededRef` (see the big comment above) is now also reset on `date`
 * change, not just on screen focus — switching dates is a genuinely
 * different data set (a different `['attendance', orgId, date]` query key),
 * so any in-progress, unsaved toggles from the PREVIOUS date are cleared
 * rather than carried over and silently attributed to the newly-selected
 * date. JUDGMENT CALL: this means switching dates before saving discards
 * unsaved toggles for the date you're leaving, with no undo — considered
 * warning before switching, but a "Marquer tous présents" bulk action
 * already has its own 5s undo for the one action most worth protecting;
 * a full unsaved-changes guard on every date switch would be new
 * interaction-pattern scope beyond what step 1 asks for.
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.1 steps 2–3) — two additive changes, no new
 * write logic (see Step 1 of this phase's own instructions: the append-
 * only insert in `handleSave` already IS a correction on a past date;
 * what was missing was visibility, not behavior):
 *
 *   1. A header icon (`ClockCounterClockwiseIcon`) opens
 *      `attendance-history.tsx` — the read-only audit view over every
 *      `attendance_records` row, not just the resolved
 *      `attendance_effective` answer this screen's own prefill uses. No
 *      layout change to the daily-toggle screen itself, per the plan's
 *      own "a header button/icon is enough" wording.
 *   2. When `date !== todayISO()`, a small inline banner above the roster
 *      states plainly that saving here adds a correction row, not an
 *      edit-in-place — reusing `ErrorState`/`OfflineBanner`'s visual
 *      language (a colored strip with an icon + short text) rather than
 *      inventing a fourth banner style. `handleSave`'s confirmation
 *      wording branches the same way: "correction enregistrée" for a
 *      past date where the worker already had an effective status before
 *      this save, "pointage enregistré" otherwise — a wording branch, not
 *      new save logic. No confirmation dialog added before a past-date
 *      save, per the plan's own explicit instruction — this screen's
 *      existing "Marquer tous présents" undo-toast is the established
 *      "make a bulk-ish action safe" pattern here, not a blocking confirm.
 */
const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'present', label: 'Présent', color: '$success' },
  { value: 'absent', label: 'Absent', color: '$danger' },
  { value: 'half_day', label: 'Demi-jour', color: '$warning' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchWorkers(orgId: string): Promise<Worker[]> {
  const { data, error } = await supabase
    .from('worker_directory')
    .select('*')
    .eq('org_id', orgId)
    .order('full_name');
  if (error) throw error;
  return data ?? [];
}

async function fetchAttendance(
  orgId: string,
  date: string,
): Promise<Record<string, AttendanceStatus>> {
  // attendance_effective (0036) already resolves manual-vs-dispatch
  // conflicts server-side — one row per (worker_id, record_date), so no
  // client-side sort/dedup is needed here at all anymore.
  const { data, error } = await supabase
    .from('attendance_effective')
    .select('worker_id, status')
    .eq('org_id', orgId)
    .eq('record_date', date);
  if (error) throw error;
  const byWorker: Record<string, AttendanceStatus> = {};
  (data ?? []).forEach((r) => {
    byWorker[r.worker_id] = r.status as AttendanceStatus;
  });
  return byWorker;
}

export default function PointageScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | undefined>>({});
  // IMPROVEMENT-PLAN PHASE 4 (§1.1 step 4 / §3) — optional context stored
  // alongside each 'absent' row. Keyed by workerId, same shape as `statuses`.
  // Only sent to the DB when a worker's status is 'absent' (see handleSave).
  const [absenceReasons, setAbsenceReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<Record<
    string,
    AttendanceStatus | undefined
  > | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSeededRef = useRef(false);
  const [date, setDate] = useState(todayISO());

  useFocusEffect(
    useCallback(() => {
      hasSeededRef.current = false;
      void getActiveOrgId().then((id) => {
        setOrgId(id);
        setOrgChecked(true);
        // Bug fix: resetting hasSeededRef alone doesn't guarantee the
        // seeding effect below re-runs — that effect is keyed on
        // `attendanceQuery.data`, and if the query's cached data already
        // has the post-save reference by the time this screen refocuses
        // (e.g. handleSave's invalidateQueries finished its background
        // refetch while this screen was unfocused, which is the common
        // case — the invalidation fires right away, well before a user
        // manually navigates back), the effect's dependency never
        // changes, so it never re-fires, and `statuses` silently keeps
        // showing whatever it held before — looking exactly like "the
        // pointage I just did wasn't saved" even though it was.
        // Explicitly refetching by key here (rather than via
        // `attendanceQuery.refetch`, whose identity isn't guaranteed
        // stable enough to close over safely) guarantees a real network
        // read on every focus, using the just-resolved `id` and `date`
        // (both in this callback's deps, so neither goes stale).
        if (id) void queryClient.refetchQueries({ queryKey: ['attendance', id, date] });
      });
    }, [queryClient, date]),
  );

  // A different date is a genuinely different data set — reseed from a
  // clean server read on every date change, same reasoning as the
  // focus-triggered reset above, not a variant of the same one. See file
  // header for the "unsaved toggles are discarded on switch" judgment
  // call this implies.
  useEffect(() => {
    hasSeededRef.current = false;
    setStatuses({});
    setAbsenceReasons({});
  }, [date]);

  const workersQuery = useQuery({
    queryKey: ['workers', orgId],
    queryFn: () => fetchWorkers(orgId as string),
    enabled: !!orgId,
  });
  // `workersQuery.data ?? []` would otherwise allocate a new empty array
  // on every render while the query is loading, defeating the useMemo
  // below (it recomputes on every render since `workers` is never
  // referentially equal to its previous value) — memoized here so
  // `workers` is stable across renders when the underlying data hasn't
  // actually changed.
  const workers = useMemo(() => workersQuery.data ?? [], [workersQuery.data]);

  // Phase 3 §1.5 — one signed-URL mint per distinct workers.photo_url in
  // the current roster, same batched pattern as team.tsx/vehicles.tsx.
  // Row-level only (workers.photo_url), not the profiles.avatar_url
  // priority chain team.tsx/worker/[id].tsx apply — a per-row profile
  // lookup here would add a second query to a screen used every day at
  // check-in time; disclosed as a deliberate simplification in
  // docs/PHASE_3_BRIEF.md rather than silently different behavior.
  const [photoUrlByPath, setPhotoUrlByPath] = useState<Record<string, string>>({});
  useEffect(() => {
    void getSignedUrlMap(workers.map((w) => w.photo_url)).then(setPhotoUrlByPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workersQuery.dataUpdatedAt]);

  const attendanceQuery = useQuery({
    queryKey: ['attendance', orgId, date],
    queryFn: () => fetchAttendance(orgId as string, date),
    enabled: !!orgId,
  });

  // Seeds local toggle state from the server read exactly once per screen
  // visit — see file header for why this can't just be a plain `useEffect`
  // keyed on `attendanceQuery.data`.
  useEffect(() => {
    if (hasSeededRef.current) return;
    if (!attendanceQuery.data) return;
    setStatuses(attendanceQuery.data);
    hasSeededRef.current = true;
  }, [attendanceQuery.data]);

  function setStatus(workerId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [workerId]: status }));
  }

  function setAbsenceReason(workerId: string, reason: string) {
    setAbsenceReasons((prev) => ({ ...prev, [workerId]: reason }));
  }

  async function handleSave() {
    if (!orgId) return;
    const entries = Object.entries(statuses).filter(([, status]) => status !== undefined);
    if (entries.length === 0) {
      Alert.alert('Aucune modification', 'Sélectionnez au moins un statut avant de valider.');
      haptics.error();
      return;
    }

    // IMPROVEMENT-PLAN PHASE 6 (§1.1 step 3) — wording branch only: a
    // past-date save where at least one changed worker already had an
    // effective status (i.e. this save is genuinely correcting something,
    // not just filling in a day nobody had touched yet) confirms as a
    // correction rather than a fresh pointage. Computed BEFORE the write
    // below, from `attendanceQuery.data` (the pre-save server state) — not
    // from `statuses`, which already holds the NEW values by this point.
    const isPastDate = date !== todayISO();
    const isCorrection =
      isPastDate && entries.some(([workerId]) => attendanceQuery.data?.[workerId] !== undefined);

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
              // IMPROVEMENT-PLAN PHASE 4 (§1.1 step 4 / §3) — only set when
              // the worker is actually absent; irrelevant for present/half_day.
              record.absenceReason =
                status === 'absent' ? (absenceReasons[workerId] ?? null) : null;
            },
          );
        }
      });
      void runSync();
      await queryClient.invalidateQueries({ queryKey: ['attendance', orgId, date] });
      haptics.confirm();
      Alert.alert(
        isCorrection ? 'Correction enregistrée' : 'Pointage enregistré',
        `${entries.length} travailleur(s) mis à jour.`,
      );
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

  const isRefreshing = workersQuery.isRefetching || attendanceQuery.isRefetching;

  function handleRefresh() {
    // A pull-to-refresh here is an explicit "give me the current server
    // state," same intent as the old visit-triggered load() — re-seed on
    // the next successful attendance read rather than leaving in-progress
    // local toggles stuck.
    hasSeededRef.current = false;
    void workersQuery.refetch();
    void attendanceQuery.refetch();
  }

  if (!orgChecked || workersQuery.isLoading || attendanceQuery.isLoading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={5} />
      </YStack>
    );
  }

  if (workersQuery.isError || attendanceQuery.isError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState
          illustration="warning"
          title="Impossible de charger le pointage"
          description="Vérifiez votre connexion et réessayez."
          onRetry={() => {
            void workersQuery.refetch();
            void attendanceQuery.refetch();
          }}
        />
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
      <FlatList
        data={workers}
        keyExtractor={(worker) => worker.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={color.accent[600]}
          />
        }
        ItemSeparatorComponent={() => <YStack height={8} />}
        ListHeaderComponent={
          <YStack>
            <XStack justifyContent="space-between" alignItems="center" marginBottom="$1">
              <XStack alignItems="center" gap="$2">
                <Icon3D name="alarm-clock-red" size={40} />
                <Text fontFamily="$display" fontSize={23} fontWeight="600">
                  Pointage
                </Text>
                {/* IMPROVEMENT-PLAN PHASE 6 (§1.1 step 2) — header icon
                    reaching the read-only audit history. No layout change
                    to this screen otherwise, per the plan's own wording. */}
                <XStack
                  onPress={() => router.push('/(contractor)/attendance-history')}
                  accessibilityRole="button"
                  accessibilityLabel="Historique de pointage"
                  width={32}
                  height={32}
                  borderRadius={999}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor="$accent50"
                >
                  <ClockCounterClockwiseIcon size={18} color={color.accent[600]} />
                </XStack>
              </XStack>
              <Button
                variant="chip"
                fullWidth={false}
                onPress={markAllPresent}
                accessibilityLabel="Marquer tous les travailleurs présents"
              >
                Marquer tous présents
              </Button>
            </XStack>
            <YStack marginBottom="$3">
              <DatePicker
                label="Date du pointage"
                value={date}
                onChange={setDate}
                maximumDate={new Date()}
              />
            </YStack>

            {/* IMPROVEMENT-PLAN PHASE 6 (§1.1 step 3) — explicit correction
                notice, shown whenever a past date is selected. Same visual
                language as ErrorState/OfflineBanner (colored strip, icon,
                short text) rather than a new banner style. */}
            {date !== todayISO() && (
              <XStack
                alignItems="center"
                gap="$2"
                backgroundColor="$accent50"
                borderRadius="$control"
                paddingVertical={10}
                paddingHorizontal={12}
                marginBottom="$3"
              >
                <InfoIcon size={16} color={color.accent[600]} />
                <Text fontSize={12.5} color="$accent700" flex={1}>
                  Vous pointez une date passée — valider ajoutera une correction, sans modifier ce
                  qui a déjà été enregistré.
                </Text>
              </XStack>
            )}

            {/* Live counts strip — answers "where does the crew stand
                right now" at a glance instead of scanning every row. */}
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
          </YStack>
        }
        renderItem={({ item: worker }) => {
          const alreadyPresent = statuses[worker.id] === 'present';
          return (
            <SwipeableRow
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
                  <Avatar
                    name={worker.full_name}
                    imageUrl={worker.photo_url ? photoUrlByPath[worker.photo_url] : undefined}
                  />
                  <Text fontSize={15.5} fontWeight="600" flex={1}>
                    {worker.full_name}
                  </Text>
                </XStack>
                <SegmentedControl
                  value={statuses[worker.id] ?? ('' as AttendanceStatus)}
                  options={STATUS_OPTIONS}
                  onChange={(status) => setStatus(worker.id, status)}
                />
                {/* IMPROVEMENT-PLAN PHASE 4 (§1.1 step 4 / §3) — absence
                    reason picker, shown only when this worker's row is
                    toggled to Absent. Optional: leaving it blank is fine
                    and the DB column is nullable. Stored via the
                    WatermelonDB write in handleSave above, not saved
                    per-worker as you pick — same single "Valider le
                    pointage" save flow as before, no new buttons. */}
                {statuses[worker.id] === 'absent' && (
                  <Select
                    label="Motif d'absence (optionnel)"
                    value={absenceReasons[worker.id] ?? null}
                    onChange={(reason) => setAbsenceReason(worker.id, reason)}
                    options={ABSENCE_REASON_OPTIONS}
                  />
                )}
              </YStack>
            </SwipeableRow>
          );
        }}
      />

      <YStack padding="$4" backgroundColor="$neutral25">
        <Button onPress={handleSave} loading={saving}>
          Valider le pointage
        </Button>
      </YStack>
    </YStack>
  );
}

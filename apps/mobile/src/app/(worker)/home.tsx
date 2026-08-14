import type { AttendanceStatus } from '@dala/shared-types';
import { router, useFocusEffect } from 'expo-router';
import { ArrowsClockwiseIcon, MapPinIcon, PackageIcon, SignOutIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { AnimatePresence, ScrollView, Text, View, XStack, YStack } from 'tamagui';

import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonHero } from '@/components/ui/Skeleton';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import AttendanceRecord from '@/db/models/AttendanceRecord';
import DispatchAssignment from '@/db/models/DispatchAssignment';
import { runSync } from '@/db/sync';
import { haptics } from '@/lib/haptics';
import { cycleStartISO, todayISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/home.tsx
 *
 * Doc 03 §4.1, Doc 05 §2.4 — "today's mission + the one button that
 * matters." Intentionally the simplest screen in the app.
 *
 * State machine derivation (Doc 01 §1.14.3 confirms the mechanism):
 * "Je suis arrivé" is what auto-writes the `present` attendance record — so
 * rather than a separately-tracked local state machine, the button's state
 * is derived directly from what's already on the server:
 *   - no actual_departure_time yet        → "Je suis parti"   (writes departure time)
 *   - actual_departure_time set, no       → "Je suis arrivé"  (writes attendance record)
 *     attendance record for today yet
 *   - attendance record exists for today  → "Envoyer un update" (§4.2, now routes to (worker)/update-chantier.tsx)
 * This also means the state survives an app restart/re-login without any
 * extra local persistence — it's always read straight from the two tables
 * that already exist for this purpose.
 *
 * PHASE 19 — SCOPE DECISION, disclosed rather than silently drawn: `load()`
 * below still reads live from Supabase, not from local WatermelonDB. Doing
 * a fully offline mission READ would need project name/address and vehicle
 * name available locally too (the `projects(name, address), vehicles(name)`
 * join below) — but `projects`/`vehicles` were never part of the 5-table
 * mobile sync scope (dispatch, attendance, advances, materials, site logs)
 * and aren't cached locally at all. Expanding the sync engine to cover them
 * is real, separate work, not something to fold silently into this screen.
 * What DID move local-first: both action buttons
 * (`handleDeparted`/`handleArrived`) now write to WatermelonDB first, then
 * sync in the background — matching the realistic pattern this screen
 * actually needs to survive (mission loads while there's still signal
 * getting to the site; the two taps that matter often happen once signal
 * is already gone at the site itself).
 */
type MissionState = 'no_assignment' | 'not_departed' | 'departed' | 'arrived';

interface Mission {
  assignmentId: string;
  version: number;
  actualDepartureTime: string | null;
  projectId: string | null;
  projectName: string | null;
  address: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  departureTime: string | null;
  assignmentDate: string;
  confirmationChannel: string | null;
  teammates: string[];
}

interface SalarySummary {
  daysThisWeek: number;
  grossThisWeek: number;
  advancesThisWeek: number;
  netThisWeek: number;
}

export default function WorkerHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [state, setState] = useState<MissionState>('no_assignment');
  const [salary, setSalary] = useState<SalarySummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: worker } = await supabase
        .from('workers')
        .select('id, org_id, daily_rate')
        .eq('user_id', session.user.id)
        .single();
      if (!worker) return;

      setWorkerId(worker.id);
      setOrgId(worker.org_id);

      const today = todayISO();

      const { data: assignment } = await supabase
        .from('dispatch_assignments')
        .select(
          'id, version, actual_departure_time, departure_time, confirmation_channel, project_id, vehicle_id, projects(name, address), vehicles(name)',
        )
        .eq('worker_id', worker.id)
        .eq('assignment_date', today)
        .maybeSingle();

      const { data: attendanceToday } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('worker_id', worker.id)
        .eq('record_date', today)
        .maybeSingle();

      if (!assignment) {
        setMission(null);
        setState('no_assignment');
      } else {
        setMission({
          assignmentId: assignment.id,
          version: assignment.version,
          actualDepartureTime: assignment.actual_departure_time,
          projectId: assignment.project_id,
          projectName: (assignment as any).projects?.name ?? null,
          address: (assignment as any).projects?.address ?? null,
          vehicleId: assignment.vehicle_id,
          vehicleName: (assignment as any).vehicles?.name ?? null,
          departureTime: assignment.departure_time,
          assignmentDate: today,
          confirmationChannel: assignment.confirmation_channel,
          teammates: [], // Doc 03 §4.1 lists teammates — needs a same-day/vehicle
          // co-assignment query; deferred, not required for the check-in
          // state machine itself.
        });

        if (attendanceToday) setState('arrived');
        else if (assignment.actual_departure_time) setState('departed');
        else setState('not_departed');
      }

      // Doc 03 §4.1 — salary strip is "never empty," computed independently
      // of whether there's a mission today.
      const weekStart = cycleStartISO();
      const { data: weekAttendance } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('worker_id', worker.id)
        .gte('record_date', weekStart);

      // Bug fix: this previously had no status filter, so pending and
      // even rejected advance requests were counted as deductions against
      // the worker's own displayed "net owed" — a worker could see their
      // pay understated by a request that hadn't been approved (or had
      // been turned down) yet.
      const { data: weekAdvances } = await supabase
        .from('advances')
        .select('amount')
        .eq('worker_id', worker.id)
        .eq('status', 'approved')
        .gte('created_at', weekStart);

      const rate = worker.daily_rate ?? 0;
      const dayValue = (status: AttendanceStatus) =>
        status === 'half_day' ? 0.5 : status === 'present' ? 1 : 0;
      const daysThisWeek = (weekAttendance ?? []).reduce(
        (sum, r) => sum + dayValue(r.status as AttendanceStatus),
        0,
      );
      const grossThisWeek = daysThisWeek * rate;
      const advancesThisWeek = (weekAdvances ?? []).reduce((sum, a) => sum + Number(a.amount), 0);

      setSalary({
        daysThisWeek,
        grossThisWeek,
        advancesThisWeek,
        netThisWeek: grossThisWeek - advancesThisWeek,
      });
    } finally {
      setLoading(false);
    }
  }

  /**
   * The local WatermelonDB copy of today's assignment may not exist yet if
   * this device hasn't synced since the contractor created it (the more
   * common case: it already does, pulled down by AutoSync). Either way,
   * this always returns a local record to write the departure time onto —
   * seeding one from what `load()` already fetched live if there's no
   * local copy yet, since the write below needs to happen locally
   * regardless of sync timing.
   */
  async function ensureLocalDispatchAssignment(m: Mission): Promise<DispatchAssignment> {
    const collection = database.get<DispatchAssignment>('dispatch_assignments');
    try {
      return await collection.find(m.assignmentId);
    } catch {
      return database.write(() =>
        collection.create((record) => {
          record._raw.id = m.assignmentId;
          record.orgId = orgId!;
          record.projectId = m.projectId;
          record.vehicleId = m.vehicleId;
          record.workerId = workerId!;
          record.assignmentDate = m.assignmentDate;
          record.departureTime = m.departureTime;
          record.confirmationChannel = m.confirmationChannel;
          record.actualDepartureTime = m.actualDepartureTime;
          record.version = m.version;
        }),
      );
    }
  }

  async function handleDeparted() {
    if (!mission || busy) return;
    setBusy(true);
    try {
      const localRecord = await ensureLocalDispatchAssignment(mission);
      await database.write(() =>
        localRecord.update((record) => {
          record.actualDepartureTime = new Date().toISOString();
          record.confirmationChannel = 'app';
        }),
      );
      void runSync();
      haptics.confirm();
      setState('departed');
    } catch {
      haptics.error();
      Alert.alert('Erreur', "Impossible d'enregistrer votre départ. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArrived() {
    if (!mission || !workerId || !orgId || busy) return;
    setBusy(true);
    try {
      // Doc 01 §1.14.3 — this insert IS the attendance ledger write; a manual
      // Pointage entry for the same worker/day, if one already exists, is
      // never overwritten by this (append-only table, insert-only policy —
      // this screen only ever inserts, never updates/deletes). The read
      // side's preference for the manual row on conflict is implemented by
      // the attendance_effective view (migration 0036), not by anything in
      // this screen — this insert doesn't need to know or care whether a
      // manual row already exists for today.
      await database.write(() =>
        createWithClientId(database.get<AttendanceRecord>('attendance_records'), (record) => {
          record.orgId = orgId;
          record.workerId = workerId;
          record.projectId = mission.projectId;
          record.recordDate = todayISO();
          record.status = 'present';
          record.source = 'dispatch_checkin';
          record.recordedBy = null;
        }),
      );
      void runSync();
      haptics.confirm();
      setState('arrived');
    } catch {
      haptics.error();
      Alert.alert('Erreur', "Impossible d'enregistrer votre arrivée. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  function handleUpdate() {
    router.push('/update-chantier');
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonHero />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Bonjour 👋
        </Text>

        {state === 'no_assignment' || !mission ? (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            alignItems="center"
            gap="$2"
          >
            <Text fontFamily="$display" fontSize={17} fontWeight="600" textAlign="center">
              Aucune mission aujourd&apos;hui
            </Text>
            <Text color="$neutral500" fontSize={14} textAlign="center">
              Revenez plus tard ou contactez votre responsable.
            </Text>
          </YStack>
        ) : (
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
            <Text fontFamily="$display" fontSize={19} fontWeight="600">
              {mission.projectName ?? 'Chantier'}
            </Text>
            {mission.address && <Text color="$neutral500">{mission.address}</Text>}
            <XStack gap="$4" flexWrap="wrap">
              {mission.vehicleName && (
                <Text fontSize={13} color="$neutral500">
                  🚐 {mission.vehicleName}
                </Text>
              )}
              {mission.departureTime && (
                <Text fontSize={13} color="$neutral500">
                  🕒 Départ {mission.departureTime}
                </Text>
              )}
            </XStack>
            {mission.teammates.length > 0 && (
              <AvatarStack people={mission.teammates.map((n) => ({ name: n }))} />
            )}
          </YStack>
        )}

        <View marginTop="$5">
          {mission && state !== 'no_assignment' && (
            <AnimatePresence>
              {/* key={state} is what drives the crossfade — swapping the
                  key unmounts the old icon+label and mounts the new one,
                  and the 'crossfade' animation (tamagui.config.ts, a
                  critically-damped 135ms spring) fades between them
                  instead of a hard instant swap. */}
              <YStack
                key={state}
                animation="crossfade"
                enterStyle={{ opacity: 0 }}
                exitStyle={{ opacity: 0 }}
                opacity={1}
              >
                {state === 'not_departed' && (
                  <Button icon={SignOutIcon} onPress={handleDeparted} loading={busy}>
                    Je suis parti
                  </Button>
                )}
                {state === 'departed' && (
                  <Button icon={MapPinIcon} onPress={handleArrived} loading={busy}>
                    Je suis arrivé
                  </Button>
                )}
                {state === 'arrived' && (
                  <Button icon={ArrowsClockwiseIcon} onPress={handleUpdate} loading={busy}>
                    Envoyer un update
                  </Button>
                )}
              </YStack>
            </AnimatePresence>
          )}
        </View>

        {mission && state !== 'no_assignment' && (
          <XStack justifyContent="center" marginTop="$3">
            <Button
              variant="text"
              fullWidth={false}
              icon={PackageIcon}
              onPress={() => router.push('/material-request')}
            >
              Demander du matériel
            </Button>
          </XStack>
        )}
      </ScrollView>

      {/* Doc 05 §2.4 — salary strip pinned at the very bottom, never scrolls
          away, never empty even with no mission today. Sits above
          WorkerBottomNav, which is rendered by (worker)/_layout.tsx.
          NumericText applies tabular-nums so the four figures don't jitter
          horizontally as their digit widths change day to day. */}
      {salary && (
        <YStack
          position="absolute"
          bottom={72}
          left={0}
          right={0}
          backgroundColor="$neutral900"
          paddingHorizontal="$4"
          paddingVertical={12}
        >
          <NumericText color="$neutral0" fontSize={13} textAlign="center">
            Cette semaine : {salary.daysThisWeek}j · {salary.grossThisWeek.toFixed(0)} TND · Avance
            reçue : {salary.advancesThisWeek.toFixed(0)} TND · Net : {salary.netThisWeek.toFixed(0)}{' '}
            TND
          </NumericText>
        </YStack>
      )}
    </YStack>
  );
}

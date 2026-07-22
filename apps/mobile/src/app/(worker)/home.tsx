import type { AttendanceStatus } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View, XStack, YStack } from 'tamagui';

import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
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
 *   - attendance record exists for today  → "Envoyer un update" (§4.2, Phase 3 — not built yet)
 * This also means the state survives an app restart/re-login without any
 * extra local persistence — it's always read straight from the two tables
 * that already exist for this purpose.
 */
type MissionState = 'no_assignment' | 'not_departed' | 'departed' | 'arrived';

interface Mission {
  assignmentId: string;
  actualDepartureTime: string | null;
  projectId: string | null;
  projectName: string | null;
  address: string | null;
  vehicleName: string | null;
  departureTime: string | null;
  teammates: string[];
}

interface SalarySummary {
  daysThisWeek: number;
  grossThisWeek: number;
  advancesThisWeek: number;
  netThisWeek: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfWeekISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday-start week
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().slice(0, 10);
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
          'id, actual_departure_time, departure_time, project_id, vehicle_id, projects(name, address), vehicles(name)',
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
          actualDepartureTime: assignment.actual_departure_time,
          projectId: assignment.project_id,
          projectName: (assignment as any).projects?.name ?? null,
          address: (assignment as any).projects?.address ?? null,
          vehicleName: (assignment as any).vehicles?.name ?? null,
          departureTime: assignment.departure_time,
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
      const weekStart = startOfWeekISO();
      const { data: weekAttendance } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('worker_id', worker.id)
        .gte('record_date', weekStart);

      const { data: weekAdvances } = await supabase
        .from('advances')
        .select('amount')
        .eq('worker_id', worker.id)
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

  async function handleDeparted() {
    if (!mission || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('dispatch_assignments')
        .update({ actual_departure_time: new Date().toISOString(), confirmation_channel: 'app' })
        .eq('id', mission.assignmentId);
      if (error) throw error;
      setState('departed');
    } catch {
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
      // never overwritten by this (read side prefers manual_pointage on
      // conflict — this screen only ever inserts, never updates/deletes).
      const { error } = await supabase.from('attendance_records').insert({
        org_id: orgId,
        worker_id: workerId,
        project_id: mission.projectId,
        record_date: todayISO(),
        status: 'present',
        source: 'dispatch_checkin',
      });
      if (error) throw error;
      setState('arrived');
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer votre arrivée. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  function handleUpdate() {
    // §4.2 Update chantier — Phase 3 per the roadmap (Doc 02 §2.10), not
    // built yet. Placeholder so the state machine's 3rd state has somewhere
    // to go rather than a dead tap target.
    Alert.alert('Bientôt disponible', "L'envoi de mises à jour de chantier arrive prochainement.");
  }

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$neutral25">
        <Text color="$neutral500">Chargement…</Text>
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
          {mission && state === 'not_departed' && (
            <Button onPress={handleDeparted} loading={busy}>
              Je suis parti
            </Button>
          )}
          {mission && state === 'departed' && (
            <Button onPress={handleArrived} loading={busy}>
              Je suis arrivé
            </Button>
          )}
          {mission && state === 'arrived' && (
            <Button onPress={handleUpdate} loading={busy}>
              Envoyer un update
            </Button>
          )}
        </View>
      </ScrollView>

      {/* Doc 05 §2.4 — salary strip pinned at the very bottom, never scrolls
          away, never empty even with no mission today. Sits above
          WorkerBottomNav, which is rendered by (worker)/_layout.tsx. */}
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
          <Text color="$neutral0" fontSize={13} textAlign="center">
            Cette semaine : {salary.daysThisWeek}j · {salary.grossThisWeek.toFixed(0)} TND · Avance
            reçue : {salary.advancesThisWeek.toFixed(0)} TND · Net : {salary.netThisWeek.toFixed(0)}{' '}
            TND
          </Text>
        </YStack>
      )}
    </YStack>
  );
}

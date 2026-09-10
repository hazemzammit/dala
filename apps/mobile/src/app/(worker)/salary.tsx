import { color } from '@dala/design-tokens';
import type { AttendanceStatus, SalaryCycle } from '@dala/shared-types';
import { router, useFocusEffect } from 'expo-router';
import { HandCoinsIcon, WalletIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cycleDates, cycleEndISO, cycleStartISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/salary.tsx
 *
 * Doc 03 §4.5 — day-by-day breakdown for the current cycle, gross,
 * advances deducted, net owed, payment status badge. Replaces the Phase 1
 * stub (which deliberately deferred this, see its old comment).
 *
 * Relies on migration 0019's `attendance_records_select_self` /
 * `advances_select_self` / `salary_cycles_select_self` RLS policies — none
 * of these three reads (or the worker home screen's equivalent ones) were
 * actually reachable by a worker session before that migration. Still true
 * here even though the query below now targets `attendance_effective`
 * (migration 0036) rather than `attendance_records` directly:
 * security_invoker = true on that view means it's still
 * `attendance_records_select_self` doing the actual filtering.
 *
 * Phase 13 fix: before 0036, the day-by-day map below was built with no
 * explicit ordering on the underlying query, so which source "won" on a
 * conflict day (a manual entry AND a dispatch check-in the same day) was
 * whatever order Postgres happened to return rows in — not reliably
 * "manual wins," despite that being the stated intent (Doc 01 §1.14.3).
 * attendance_effective resolves this server-side now, so the map below no
 * longer needs to reason about ordering at all.
 */
const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  half_day: 'Demi-journée',
};
const STATUS_VALUE: Record<AttendanceStatus, number> = { present: 1, absent: 0, half_day: 0.5 };
const STATUS_COLOR: Record<AttendanceStatus, 'success' | 'danger' | 'warning'> = {
  present: 'success',
  absent: 'danger',
  half_day: 'warning',
};

interface DayRow {
  date: string;
  status: AttendanceStatus | null;
  value: number;
}

export default function WorkerSalaryScreen() {
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — none of these queries had error capture; a
  // failure previously left dailyRate/totalDays at 0, indistinguishable
  // from a genuinely-empty cycle.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyRate, setDailyRate] = useState(0);
  const [days, setDays] = useState<DayRow[]>([]);
  const [advancesTotal, setAdvancesTotal] = useState(0);
  const [cycle, setCycle] = useState<SalaryCycle | null>(null);

  const cycleStart = cycleStartISO();
  const cycleEnd = cycleEndISO();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: worker, error: workerError } = await supabase
        .from('workers')
        .select('id, org_id, daily_rate')
        .eq('user_id', session.user.id)
        .single();
      if (workerError) {
        setLoadError(true);
        return;
      }
      if (!worker) return;

      setDailyRate(worker.daily_rate ?? 0);

      const [
        { data: attendance, error: attendanceError },
        { data: advances, error: advancesError },
        { data: cycles, error: cyclesError },
      ] = await Promise.all([
        supabase
          .from('attendance_effective')
          .select('record_date, status')
          .eq('worker_id', worker.id)
          .gte('record_date', cycleStart)
          .lte('record_date', cycleEnd),
        supabase
          .from('advances')
          .select('amount')
          .eq('worker_id', worker.id)
          .eq('status', 'approved')
          .gte('created_at', cycleStart),
        supabase
          .from('salary_cycles')
          .select('*')
          .eq('worker_id', worker.id)
          .eq('cycle_start', cycleStart)
          .maybeSingle(),
      ]);
      if (attendanceError || advancesError || cyclesError) {
        setLoadError(true);
        return;
      }

      const statusByDate: Record<string, AttendanceStatus> = {};
      (attendance ?? []).forEach((r) => {
        statusByDate[r.record_date] = r.status as AttendanceStatus;
      });

      const rows: DayRow[] = cycleDates().map((date) => {
        const status = statusByDate[date] ?? null;
        return { date, status, value: status ? (STATUS_VALUE[status] ?? 0) : 0 };
      });
      setDays(rows);

      setAdvancesTotal((advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0));
      setCycle((cycles as SalaryCycle | null) ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const totalDays = days.reduce((sum, d) => sum + d.value, 0);
  const gross = totalDays * dailyRate;
  const net = gross - advancesTotal;
  const paid = cycle?.status === 'paid';

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
      </YStack>
    );
  }

  if (dailyRate === 0 && totalDays === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={WalletIcon}
          illustration="payments"
          title="Aucune donnée pour ce cycle"
          description="Votre détail de salaire apparaîtra ici dès qu'un pointage sera enregistré."
          actionLabel="Demander une avance"
          actionHref="/advance-request"
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
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
            Mon salaire
          </Text>
          <StatusBadge variant={paid ? 'success' : 'neutral'}>
            {paid ? 'Payé' : 'En attente'}
          </StatusBadge>
        </XStack>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          Cycle du {cycleStart} au {cycleEnd}
        </Text>

        <YStack backgroundColor="$neutral900" borderRadius="$card" padding="$4" marginBottom="$4">
          <XStack justifyContent="space-between" marginBottom="$3">
            <YStack>
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Brut
              </Text>
              <NumericText color="$neutral0" fontSize={19} fontWeight="600">
                {gross.toFixed(0)} TND
              </NumericText>
            </YStack>
            <YStack>
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Avances
              </Text>
              <NumericText color="$neutral0" fontSize={19} fontWeight="600">
                {advancesTotal.toFixed(0)} TND
              </NumericText>
            </YStack>
            <YStack alignItems="flex-end">
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Net
              </Text>
              <NumericText color="$neutral0" fontFamily="$display" fontSize={23} fontWeight="700">
                {net.toFixed(0)} TND
              </NumericText>
            </YStack>
          </XStack>
        </YStack>

        <Text
          fontSize={13}
          fontWeight="600"
          color="$neutral500"
          textTransform="uppercase"
          marginBottom="$2"
        >
          Détail du cycle
        </Text>
        <YStack
          backgroundColor="$neutral0"
          borderRadius="$card"
          overflow="hidden"
          marginBottom="$4"
        >
          {days.map((day, i) => (
            <XStack
              key={day.date}
              justifyContent="space-between"
              alignItems="center"
              paddingHorizontal="$4"
              paddingVertical={12}
              borderTopWidth={i === 0 ? 0 : 1}
              borderTopColor="$neutral100"
            >
              <Text fontSize={14.5}>{day.date}</Text>
              {day.status ? (
                <XStack alignItems="center" gap="$3">
                  <StatusBadge variant={STATUS_COLOR[day.status]}>
                    {STATUS_LABEL[day.status]}
                  </StatusBadge>
                  <NumericText fontSize={14} color="$neutral500" width={64} textAlign="right">
                    {(day.value * dailyRate).toFixed(0)} TND
                  </NumericText>
                </XStack>
              ) : (
                <Text fontSize={13} color="$neutral500">
                  —
                </Text>
              )}
            </XStack>
          ))}
        </YStack>

        <Button
          variant="secondary"
          icon={HandCoinsIcon}
          onPress={() => router.push('/advance-request')}
        >
          Demander une avance
        </Button>
      </ScrollView>
    </YStack>
  );
}

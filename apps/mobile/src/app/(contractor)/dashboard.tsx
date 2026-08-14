import { color } from '@dala/design-tokens';
import type { AttendanceStatus, Project, Worker } from '@dala/shared-types';
import { router, useFocusEffect } from 'expo-router';
import { BuildingsIcon, CaretDownIcon, CaretRightIcon, HandCoinsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { OrgSwitcherSheet } from '@/components/shell/OrgSwitcherSheet';
import { Avatar } from '@/components/ui/Avatar';
import { NumericText } from '@/components/ui/NumericText';
import { ProgressBar } from '@/components/ui/Progress';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { runSync } from '@/db/sync';
import { getActiveOrgId, setActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { listMyOrganizations, listOwnedOrganizations, type MyOrgSummary } from '@/lib/myOrgs';
import { cycleEndISO, cycleStartISO, todayISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/dashboard.tsx
 *
 * Doc 03 §3.9, Doc 05 §2.2 — Phase 27 rebuild, per the Phase 23/24 UI/UX
 * audit's own top-priority finding: Phase 23 shipped this screen as three
 * tappable nav rows with no hero number, no chart, and no progress
 * indicator anywhere — a real gap against Doc 05 §2.2's own 5-block layout
 * (hero card / dispatch summary / active projects / activity feed), which
 * was speced but never built. This phase builds the blocks Doc 05 always
 * called for, using the primitives added in Phase 24 (StatCard, Sparkline,
 * ProgressBar) and Phase 26 (none directly, but the same screen benefits
 * from PlateInput/TimeInput existing elsewhere in the app).
 *
 * STILL CUT, same reason as Phase 23 — re-verified, not silently dropped:
 *   - Activity feed: `audit_log` (migration 0009) still has zero
 *     client-facing RLS policies — its own migration header says so
 *     explicitly. No mobile-readable data source exists for this yet. This
 *     remains a backend gap (new RLS policy or a purpose-built feed
 *     table/view), not a UI decision — flagged, not faked with mock data.
 *   - Profile-completion checklist / unverified-email banner: real §3.9
 *     elements, still out of scope for this pass — pulls from four
 *     different tables per Doc 01 §1.3.12–13, sized like its own phase.
 *
 * NEWLY BUILT this phase:
 *   - Hero StatCard: "Net à payer cette semaine" — the same unpaid-net
 *     calculation advances.tsx's `runningTotal` already uses (gross
 *     attendance-derived pay minus approved advances, summed only across
 *     workers whose current-cycle `salary_cycles` row isn't `paid`),
 *     reused here rather than re-invented, with a 4-week gross-payroll
 *     sparkline beneath it (bars, per Doc 05 §2.2's own "bars for money"
 *     rule) and a delta chip comparing this week's gross payroll cost to
 *     last week's.
 *   - Dispatch-today: was a single aggregate tile ("N / M véhicules
 *     sortis"); now a horizontal-scrolling row of worker chips (avatar +
 *     name + status dot: à venir/en route/sur place), matching Doc 05
 *     §2.2's mine-cloud-style row instead of one number.
 *   - Active projects: was entirely absent; now a horizontal carousel of
 *     up to 3 lead-org active projects, each with the same ProgressBar +
 *     budget-consumed logic projects.tsx already computes (reused, not
 *     duplicated) — this is also the first progress indicator visible on
 *     the app's most-visited screen.
 *   - "Chantiers"/"Avances" nav rows kept but restyled as a 2-column quick-
 *     action grid instead of two stacked full-width rows — denser, more
 *     scannable, still exactly two destinations (no complexity creep).
 *
 * DATA SOURCE for dispatch-today / active-projects: still
 * `supabase.from()` direct reads, not WatermelonDB — same two reasons as
 * Phase 23 (dispatch.tsx's own primary list already reads this way, and
 * WatermelonDB's native JSI linking remains unverified on a real device —
 * see Item 2b, unchanged since Phase 18). Once that's live-verified, this
 * is a reasonable screen to convert to a local-first read.
 */

interface DispatchTodayWorker {
  workerId: string;
  name: string;
  status: 'a_venir' | 'en_route' | 'sur_place';
}

interface ActiveProjectSummary extends Project {
  consumedTotal: number;
}

interface WeeklyPayrollPoint {
  weekStart: string;
  gross: number;
}

const STATUS_DOT: Record<DispatchTodayWorker['status'], { color: string; label: string }> = {
  a_venir: { color: color.neutral[300], label: 'À venir' },
  en_route: { color: color.status.warning, label: 'En route' },
  sur_place: { color: color.status.success, label: 'Sur place' },
};

const ATTENDANCE_DAY_VALUE: Record<AttendanceStatus, number> = {
  present: 1,
  absent: 0,
  half_day: 0.5,
};

export default function DashboardScreen() {
  const [orgs, setOrgs] = useState<MyOrgSummary[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [netThisWeek, setNetThisWeek] = useState(0);
  const [payrollDeltaPercent, setPayrollDeltaPercent] = useState<number | null>(null);
  const [payrollSparkline, setPayrollSparkline] = useState<number[]>([]);

  const [dispatchToday, setDispatchToday] = useState<DispatchTodayWorker[]>([]);
  const [activeProjects, setActiveProjects] = useState<ActiveProjectSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const [all, owned, active] = await Promise.all([
      listMyOrganizations(),
      listOwnedOrganizations(),
      getActiveOrgId(),
    ]);
    setOrgs(all);
    setOwnedCount(owned.length);
    setActiveOrgIdState(active);

    await Promise.all([
      loadGreetingName(),
      loadDispatchToday(active),
      loadActiveProjects(active),
      loadPayrollSummary(active),
    ]);
    setLoading(false);
  }

  async function loadGreetingName() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle();

    const full = profile?.full_name?.trim();
    setFirstName(full ? full.split(' ')[0] : null);
  }

  async function loadDispatchToday(org: string | null) {
    if (!org) {
      setDispatchToday([]);
      return;
    }
    const today = todayISO();
    const [{ data: assignments }, { data: attendance }] = await Promise.all([
      supabase
        .from('dispatch_assignments')
        .select('worker_id, actual_departure_time, workers(full_name)')
        .eq('org_id', org)
        .eq('assignment_date', today),
      supabase
        .from('attendance_effective')
        .select('worker_id')
        .eq('org_id', org)
        .eq('record_date', today),
    ]);

    const arrivedIds = new Set((attendance ?? []).map((a) => a.worker_id));
    const workers: DispatchTodayWorker[] = (assignments ?? []).map((a: any) => ({
      workerId: a.worker_id,
      name: a.workers?.full_name ?? 'Ouvrier',
      status: arrivedIds.has(a.worker_id)
        ? 'sur_place'
        : a.actual_departure_time
          ? 'en_route'
          : 'a_venir',
    }));
    setDispatchToday(workers);
  }

  async function loadActiveProjects(org: string | null) {
    if (!org) {
      setActiveProjects([]);
      return;
    }
    // Lead-org's own active projects only, most-recent-first, capped at 3 —
    // matches the "2–3 project cards" count Doc 05 §2.2 specs for this
    // block. Reuses projects.tsx's own consumedTotal-from-project_expenses
    // pattern rather than inventing a second way to compute it.
    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3);

    const projectIds = (projects ?? []).map((p) => p.id);
    let consumedById: Record<string, number> = {};
    if (projectIds.length > 0) {
      const { data: expenseRows } = await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', projectIds);
      consumedById = (expenseRows ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.amount);
        return acc;
      }, {});
    }

    setActiveProjects(
      (projects ?? []).map((p) => ({ ...(p as Project), consumedTotal: consumedById[p.id] ?? 0 })),
    );
  }

  async function loadPayrollSummary(org: string | null) {
    if (!org) {
      setNetThisWeek(0);
      setPayrollDeltaPercent(null);
      setPayrollSparkline([]);
      return;
    }

    const currentCycleStart = cycleStartISO();
    const currentCycleEnd = cycleEndISO();
    // 4 weeks back from the current cycle's Monday — gives 4 full weekly
    // buckets (3 prior + current) for the sparkline trend.
    const fourWeeksAgo = new Date(currentCycleStart);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
    const windowStartISO = fourWeeksAgo.toISOString().slice(0, 10);

    const [{ data: workers }, { data: attendance }, { data: advancesThisWeek }, { data: cycles }] =
      await Promise.all([
        supabase.from('workers').select('id, daily_rate').eq('org_id', org),
        supabase
          .from('attendance_effective')
          .select('worker_id, status, record_date')
          .eq('org_id', org)
          .gte('record_date', windowStartISO)
          .lte('record_date', currentCycleEnd),
        supabase
          .from('advances')
          .select('worker_id, amount')
          .eq('org_id', org)
          .eq('status', 'approved')
          .gte('created_at', currentCycleStart),
        supabase
          .from('salary_cycles')
          .select('worker_id, status')
          .eq('org_id', org)
          .eq('cycle_start', currentCycleStart),
      ]);

    const rateByWorker: Record<string, number> = {};
    (workers ?? []).forEach((w: Pick<Worker, 'id' | 'daily_rate'>) => {
      rateByWorker[w.id] = w.daily_rate ?? 0;
    });

    // Bucket every attendance row into one of 4 weekly buckets by that
    // row's own week-start, so a worker's day counts toward the week it
    // actually happened in — not just the current cycle.
    const weekBuckets = new Map<string, number>(); // weekStart -> gross
    const daysThisWeekByWorker: Record<string, number> = {};

    (attendance ?? []).forEach((r) => {
      const recordDate = new Date(r.record_date as string);
      const weekStart = cycleStartISO(recordDate);
      const value = ATTENDANCE_DAY_VALUE[r.status as AttendanceStatus] ?? 0;
      const rate = rateByWorker[r.worker_id as string] ?? 0;
      weekBuckets.set(weekStart, (weekBuckets.get(weekStart) ?? 0) + value * rate);

      if (weekStart === currentCycleStart) {
        daysThisWeekByWorker[r.worker_id as string] =
          (daysThisWeekByWorker[r.worker_id as string] ?? 0) + value;
      }
    });

    // 4 chronological weekly gross totals (oldest → newest) for the
    // sparkline — Doc 05 §2.2 "bars for money."
    const weekStarts: string[] = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(currentCycleStart);
      d.setDate(d.getDate() - i * 7);
      weekStarts.push(cycleStartISO(d));
    }
    const sparkline: WeeklyPayrollPoint[] = weekStarts.map((weekStart) => ({
      weekStart,
      gross: weekBuckets.get(weekStart) ?? 0,
    }));
    setPayrollSparkline(sparkline.map((p) => p.gross));

    const thisWeekGross = sparkline[3]?.gross ?? 0;
    const lastWeekGross = sparkline[2]?.gross ?? 0;
    setPayrollDeltaPercent(
      lastWeekGross > 0
        ? Math.round(((thisWeekGross - lastWeekGross) / lastWeekGross) * 100)
        : null,
    );

    // Hero number: net owed THIS week, unpaid cycles only — identical
    // semantics to advances.tsx's own `runningTotal`, reused rather than
    // re-derived differently here.
    const advancesByWorker: Record<string, number> = {};
    (advancesThisWeek ?? []).forEach((a) => {
      advancesByWorker[a.worker_id as string] =
        (advancesByWorker[a.worker_id as string] ?? 0) + Number(a.amount);
    });
    const paidWorkerIds = new Set(
      (cycles ?? []).filter((c) => c.status === 'paid').map((c) => c.worker_id),
    );
    let net = 0;
    Object.keys(rateByWorker).forEach((workerId) => {
      if (paidWorkerIds.has(workerId)) return;
      const gross = (daysThisWeekByWorker[workerId] ?? 0) * rateByWorker[workerId]!;
      const advances = advancesByWorker[workerId] ?? 0;
      net += gross - advances;
    });
    setNetThisWeek(net);
  }

  async function handleSelect(orgId: string) {
    setSheetOpen(false);
    if (orgId === activeOrgId) return;
    const ok = await setActiveOrgId(orgId);
    if (ok) {
      haptics.confirm();
      setActiveOrgIdState(orgId);
      void loadDispatchToday(orgId);
      void loadActiveProjects(orgId);
      void loadPayrollSummary(orgId);
      // Phase 20 — pullChanges.ts's own header names this as the missing
      // one-line addition: without it, a multi-org owner who switches orgs
      // sees stale (or, on the very first switch to that org on this
      // device, entirely wrong-org) locally-cached data until the next
      // foreground/reconnect event happens to fire AutoSync. Same
      // fire-and-forget `void runSync()` pattern every other write-path
      // screen already uses.
      void runSync();
    } else {
      haptics.error();
    }
  }

  const activeOrg = orgs.find((o) => o.org_id === activeOrgId);

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <YStack gap="$3">
          {loading ? (
            <SkeletonBlock width="60%" height={23} />
          ) : (
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              {firstName ? `Bonjour, ${firstName} 👋` : 'Bonjour 👋'}
            </Text>
          )}

          {/* Doc 05 §2.2 — org-switcher pill. Only rendered once org data
              has loaded and there's something to switch between/toward. */}
          {(orgs.length > 1 || ownedCount > 1) && activeOrg && (
            <XStack
              alignSelf="flex-start"
              alignItems="center"
              gap="$2"
              backgroundColor="$neutral0"
              borderRadius={999}
              paddingVertical={8}
              paddingHorizontal={14}
              onPress={() => setSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Changer d'entreprise"
            >
              <Text fontSize={14} fontWeight="500">
                {activeOrg.name}
              </Text>
              <CaretDownIcon size={14} weight="bold" />
            </XStack>
          )}
        </YStack>

        <OrgSwitcherSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          orgs={orgs}
          ownedOrgCount={ownedCount}
          activeOrgId={activeOrgId}
          onSelect={handleSelect}
        />

        {/* Phase 27 — hero StatCard, the block Doc 05 §2.2 specs first and
            Phase 23 explicitly cut. */}
        <StatCard
          label="Net à payer cette semaine"
          value={netThisWeek.toFixed(0)}
          unit="TND"
          delta={payrollDeltaPercent ?? undefined}
          sparklineData={payrollSparkline}
          sparklineVariant="bars"
          loading={loading}
          onPress={() => router.push('/advances')}
        />

        {/* Dispatch-today — was a single aggregate tile; now a horizontal
            row of worker chips (avatar + name + status dot), matching
            Doc 05 §2.2's mine-cloud-style row. */}
        <YStack gap="$2.5">
          <XStack justifyContent="space-between" alignItems="center">
            <Text
              fontSize={13}
              fontWeight="600"
              color="$neutral500"
              textTransform="uppercase"
              letterSpacing={0.4}
            >
              Dispatch aujourd'hui
            </Text>
            <XStack
              alignItems="center"
              gap={2}
              onPress={() => router.push('/dispatch')}
              accessibilityRole="button"
              accessibilityLabel="Voir le dispatch du jour"
            >
              <Text fontSize={13} color="$accent600" fontWeight="600">
                Voir tout
              </Text>
              <CaretRightIcon size={12} weight="bold" color={color.accent[600]} />
            </XStack>
          </XStack>

          {loading ? (
            <XStack gap="$2">
              <SkeletonBlock width={96} height={84} radius={16} />
              <SkeletonBlock width={96} height={84} radius={16} />
              <SkeletonBlock width={96} height={84} radius={16} />
            </XStack>
          ) : dispatchToday.length === 0 ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4">
              <Text fontSize={13.5} color="$neutral500">
                Aucune affectation aujourd'hui.
              </Text>
            </YStack>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$2.5">
                {dispatchToday.map((worker) => {
                  const dot = STATUS_DOT[worker.status];
                  return (
                    <YStack
                      key={worker.workerId}
                      width={104}
                      backgroundColor="$neutral0"
                      borderRadius="$card"
                      padding="$3"
                      alignItems="center"
                      gap="$1.5"
                      onPress={() => router.push('/dispatch')}
                      accessibilityRole="button"
                      accessibilityLabel={`${worker.name}, ${dot.label}`}
                    >
                      <Avatar name={worker.name} size={36} />
                      <Text fontSize={12.5} fontWeight="600" numberOfLines={1} textAlign="center">
                        {worker.name}
                      </Text>
                      <XStack alignItems="center" gap={4}>
                        <YStack
                          width={6}
                          height={6}
                          borderRadius={999}
                          backgroundColor={dot.color}
                        />
                        <Text fontSize={11} color="$neutral500">
                          {dot.label}
                        </Text>
                      </XStack>
                    </YStack>
                  );
                })}
              </XStack>
            </ScrollView>
          )}
        </YStack>

        {/* Active projects — was entirely absent; a horizontal carousel
            with the app's first on-screen progress bar, reusing
            projects.tsx's own budget-consumed calculation. */}
        <YStack gap="$2.5">
          <XStack justifyContent="space-between" alignItems="center">
            <Text
              fontSize={13}
              fontWeight="600"
              color="$neutral500"
              textTransform="uppercase"
              letterSpacing={0.4}
            >
              Chantiers actifs
            </Text>
            <XStack
              alignItems="center"
              gap={2}
              onPress={() => router.push('/portfolio')}
              accessibilityRole="button"
              accessibilityLabel="Voir tous les chantiers"
            >
              <Text fontSize={13} color="$accent600" fontWeight="600">
                Voir tout
              </Text>
              <CaretRightIcon size={12} weight="bold" color={color.accent[600]} />
            </XStack>
          </XStack>

          {loading ? (
            <XStack gap="$2.5">
              <SkeletonBlock width={220} height={110} radius={16} />
              <SkeletonBlock width={220} height={110} radius={16} />
            </XStack>
          ) : activeProjects.length === 0 ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4">
              <Text fontSize={13.5} color="$neutral500">
                Aucun chantier actif pour le moment.
              </Text>
            </YStack>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$2.5">
                {activeProjects.map((project) => {
                  const consumedPercent =
                    project.budget_total && project.budget_total > 0
                      ? Math.min(
                          100,
                          Math.round((project.consumedTotal / project.budget_total) * 100),
                        )
                      : null;
                  return (
                    <YStack
                      key={project.id}
                      width={220}
                      backgroundColor="$neutral0"
                      borderRadius="$card"
                      padding="$4"
                      gap="$2"
                      onPress={() => router.push(`/project/${project.id}` as never)}
                      accessibilityRole="button"
                      accessibilityLabel={project.name}
                    >
                      <Text fontSize={15} fontWeight="600" numberOfLines={1}>
                        {project.name}
                      </Text>
                      {project.client_name && (
                        <Text fontSize={12.5} color="$neutral500" numberOfLines={1}>
                          {project.client_name}
                        </Text>
                      )}
                      {consumedPercent !== null ? (
                        <YStack gap="$1" marginTop="$1">
                          <XStack justifyContent="space-between">
                            <Text fontSize={11.5} color="$neutral500">
                              Budget consommé
                            </Text>
                            <NumericText fontSize={11.5} fontWeight="600">
                              {consumedPercent}%
                            </NumericText>
                          </XStack>
                          <ProgressBar value={consumedPercent} height={5} />
                        </YStack>
                      ) : (
                        <Text fontSize={11.5} color="$neutral500" marginTop="$1">
                          Pas de budget défini
                        </Text>
                      )}
                    </YStack>
                  );
                })}
              </XStack>
            </ScrollView>
          )}
        </YStack>

        {/* Quick actions — restyled from two stacked full-width rows into
            a 2-column grid. Still exactly the two destinations Phase 23
            shipped, no complexity creep. */}
        <XStack gap="$2.5">
          <YStack
            flex={1}
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$2"
            alignItems="center"
            onPress={() => router.push('/portfolio')}
            accessibilityRole="button"
            accessibilityLabel="Voir tous les chantiers"
          >
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor="$accent50"
              alignItems="center"
              justifyContent="center"
            >
              <BuildingsIcon size={20} weight="bold" color={color.accent[600]} />
            </YStack>
            <Text fontSize={14} fontWeight="600">
              Chantiers
            </Text>
          </YStack>

          <YStack
            flex={1}
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$2"
            alignItems="center"
            onPress={() => router.push('/advances')}
            accessibilityRole="button"
            accessibilityLabel="Voir les avances"
          >
            <YStack
              width={40}
              height={40}
              borderRadius={20}
              backgroundColor="$accent50"
              alignItems="center"
              justifyContent="center"
            >
              <HandCoinsIcon size={20} weight="bold" color={color.accent[600]} />
            </YStack>
            <Text fontSize={14} fontWeight="600">
              Avances
            </Text>
          </YStack>
        </XStack>

        {/* Activity feed — still deliberately not built; see file header. */}
      </ScrollView>
    </YStack>
  );
}

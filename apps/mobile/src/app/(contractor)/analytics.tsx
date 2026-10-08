import type { AttendanceStatus, Project } from '@dala/shared-types';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  BuildingsIcon,
  CoinsIcon,
  TruckIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { MoneyGate } from '@/components/ui/MoneyGate';
import { BarChart, LineChart } from '@/components/ui/Chart';
import { ChartCard } from '@/components/ui/ChartCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { thresholdColor } from '@/components/ui/Progress';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getActiveOrgId } from '@/lib/activeOrg';
import { calculateConsumedPercent, calculateConsumedTotal } from '@/lib/budget';
import { getProjectTypeMeta } from '@/lib/projectTypeMeta';
import { cycleEndISO, cycleStartISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';
import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/analytics.tsx
 *
 * IMPROVEMENT-PLAN PHASE 7 (§2.3 "Analytics — dedicated screen") — the one
 * new screen this phase adds, reachable from `PlusSheet.tsx`'s new
 * "Analyses" row. Assembles the existing `BarChart`/`LineChart`
 * (`components/ui/Chart.tsx`) against the eight data sets §2.3 names — see
 * `docs/PHASE_7_BRIEF.md` for the full read-before-writing investigation
 * and every judgment call below in one place.
 *
 * READ-ONLY screen, no WatermelonDB/offline-write coupling — same shape as
 * `vehicles.tsx`'s Phase 1 React Query slice, so this uses the same
 * pattern: one `useQuery` keyed `['analytics', orgId]`, `isLoading`/
 * `isError`/data mapping onto `SkeletonList`/`ErrorState`/content per
 * `docs/ARCHITECTURE.md`'s "Mobile data-fetching" section.
 *
 * TWO DIFFERENT "cost" computations appear in this file, on purpose, not
 * by accident — flagged here so a future reader doesn't "fix" one to match
 * the other:
 *   - Financial §1's "Coût réel" (cost per project, compared to budget) is
 *     LIFETIME (all project_expenses + all attendance-derived payroll for
 *     that project, no date window) — a budget is a lifetime figure
 *     (`projects.budget_total`), so comparing it against only a recent
 *     slice of spending would be misleading.
 *   - Projects §3's "Budget consommé" reuses `lib/budget.ts`'s existing
 *     `calculateConsumedTotal`/`calculateConsumedPercent` UNCHANGED — the
 *     established Doc 01 §1.14.2 definition, expenses-only, payroll
 *     deliberately excluded to avoid double-counting against the SAME
 *     `budget_total` this project's Financial-section bar also uses (see
 *     `expenses.tsx`'s own header for why payroll stays out of that
 *     specific ratio). This screen does not change that definition; it
 *     only charts it.
 *   - Everything else (cash-out trend, attendance-rate trend, headcount,
 *     vehicle utilization, safety trend) is WINDOWED (6 months / 8 weeks /
 *     30 days as noted per chart) — these are trend charts, not lifetime
 *     totals, and an unbounded read for each would be unnecessary load for
 *     what's meant to be a fast-loading screen.
 *
 * `Chart.tsx`'s `BarChart`/`LineChart` each take exactly ONE data series
 * (confirmed by reading the file before writing this — no grouped/stacked
 * bars, no per-bar color, no multi-line support). Two sections need more
 * than one series and are NOT solved by modifying `Chart.tsx` (this phase
 * stays assembly-only, per §2.3's own framing) — instead:
 *   - Financial §1 renders TWO stacked single-series `BarChart`s sharing
 *     the same project-name labels (cost, then budget), not one grouped
 *     chart.
 *   - Operations §4's severity trend renders THREE stacked single-series
 *     `BarChart`s (Mineur/Modéré/Grave) sharing the same month labels.
 * See PHASE_7_BRIEF.md §3 for the full reasoning.
 */

const ATTENDANCE_DAY_VALUE: Record<AttendanceStatus, number> = {
  present: 1,
  absent: 0,
  half_day: 0.5,
};

// Max bars a single BarChart section renders before capping — Chart.tsx's
// BarChart has no horizontal scroll/pagination (confirmed by reading it),
// so beyond ~10 evenly-divided flex={1} bars, labels and values become
// unreadable on a phone screen. Applied to any per-worker/per-vehicle/
// per-project bar list that could realistically exceed this for a large
// org; a caption discloses how many were omitted.
const MAX_BARS = 10;

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgoISO(n: number): string {
  const d = new Date();
  d.setDate(1); // pin to day 1 first so a short target month (e.g. Feb)
  // never rolls the date over into the following month.
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** Last `n` months INCLUDING the current one, oldest → newest, "YYYY-MM". */
function trailingMonthKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

function monthLabel(monthKey: string): string {
  const d = new Date(`${monthKey}-01T00:00:00`);
  const label = d.toLocaleDateString('fr-TN', { month: 'short' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Last `n` week-starts INCLUDING the current cycle's Monday, oldest →
 * newest — same Monday-boundary `cycleStartISO()` every other screen's
 * weekly bucketing already uses (dashboard.tsx's payroll sparkline). */
function trailingWeekStarts(n: number): string[] {
  const currentStart = cycleStartISO();
  const starts: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(currentStart);
    d.setDate(d.getDate() - i * 7);
    starts.push(cycleStartISO(d));
  }
  return starts;
}

function weekLabel(weekStartISO: string): string {
  const d = new Date(weekStartISO);
  return d.toLocaleDateString('fr-TN', { day: 'numeric', month: 'short' });
}

interface AttendanceRow {
  worker_id: string;
  project_id: string | null;
  status: AttendanceStatus;
  record_date: string;
}

interface AnalyticsData {
  workers: { id: string; full_name: string; daily_rate: number | null }[];
  projects: Project[];
  vehicles: { id: string; name: string }[];
  attendanceWindowed: AttendanceRow[]; // last 6 months, org-wide
  attendanceLifetimeActive: AttendanceRow[]; // no date filter, active projects only
  expensesWindowed: { project_id: string; amount: number; expense_date: string }[]; // last 6 months
  expensesLifetimeActive: { project_id: string; amount: number }[]; // no date filter, active projects only
  advancesWindowed: { amount: number; created_at: string }[]; // approved, last 6 months
  dispatchRecent: { vehicle_id: string | null; assignment_date: string }[]; // last 30 days
  safetyWindowed: { severity: string; created_at: string }[]; // last 6 months
}

async function fetchAnalyticsData(orgId: string): Promise<AnalyticsData> {
  const sixMonthsAgo = monthsAgoISO(6);
  const thirtyDaysAgo = daysAgoISO(30);

  const [{ data: workers }, { data: projects }, { data: vehicles }] = await Promise.all([
    supabase
      .from('worker_directory')
      .select('id, full_name, daily_rate')
      .eq('org_id', orgId)
      .is('deleted_at', null),
    supabase.from('projects').select('*').eq('lead_org_id', orgId).is('deleted_at', null),
    supabase.from('vehicles').select('id, name').eq('org_id', orgId),
  ]);

  const activeProjectIds = (projects ?? []).filter((p) => p.status === 'active').map((p) => p.id);

  const [
    { data: attendanceWindowed },
    { data: attendanceLifetimeActive },
    { data: expensesWindowed },
    { data: expensesLifetimeActive },
    { data: advancesWindowed },
    { data: dispatchRecent },
    { data: safetyWindowed },
  ] = await Promise.all([
    supabase
      .from('attendance_effective')
      .select('worker_id, project_id, status, record_date')
      .eq('org_id', orgId)
      .gte('record_date', sixMonthsAgo),
    activeProjectIds.length > 0
      ? supabase
          .from('attendance_effective')
          .select('worker_id, project_id, status, record_date')
          .eq('org_id', orgId)
          .in('project_id', activeProjectIds)
      : Promise.resolve({ data: [] as AttendanceRow[] }),
    supabase
      .from('project_expenses')
      .select('project_id, amount, expense_date')
      .eq('org_id', orgId)
      .gte('expense_date', sixMonthsAgo),
    activeProjectIds.length > 0
      ? supabase
          .from('project_expenses')
          .select('project_id, amount')
          .eq('org_id', orgId)
          .in('project_id', activeProjectIds)
      : Promise.resolve({ data: [] as { project_id: string; amount: number }[] }),
    supabase
      .from('advances')
      .select('amount, created_at')
      .eq('org_id', orgId)
      .eq('status', 'approved')
      .gte('created_at', sixMonthsAgo),
    supabase
      .from('dispatch_assignments')
      .select('vehicle_id, assignment_date')
      .eq('org_id', orgId)
      .gte('assignment_date', thirtyDaysAgo),
    supabase
      .from('safety_incidents')
      .select('severity, created_at')
      .eq('org_id', orgId)
      .gte('created_at', sixMonthsAgo),
  ]);

  return {
    workers: workers ?? [],
    projects: projects ?? [],
    vehicles: vehicles ?? [],
    attendanceWindowed: (attendanceWindowed ?? []) as AttendanceRow[],
    attendanceLifetimeActive: (attendanceLifetimeActive ?? []) as AttendanceRow[],
    expensesWindowed: expensesWindowed ?? [],
    expensesLifetimeActive: expensesLifetimeActive ?? [],
    advancesWindowed: advancesWindowed ?? [],
    dispatchRecent: dispatchRecent ?? [],
    safetyWindowed: safetyWindowed ?? [],
  };
}

/** Small, consistent fallback for a chart section with nothing to plot —
 * same copy `generate-report`'s PDF charts already use for a zero-row
 * date range (Phase 5), reused here for visual/copy consistency between
 * the in-app chart and its PDF equivalent. */
function ChartEmpty() {
  return (
    <Text fontSize={13} color="$neutral500" paddingVertical="$3" textAlign="center">
      Aucune donnée pour cette période.
    </Text>
  );
}

function CappedNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <Text fontSize={11.5} color="$neutral500" marginTop="$1">
      {shown} sur {total} affichés.
    </Text>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <XStack alignItems="center" gap="$1.5">
      <View width={8} height={8} borderRadius={999} backgroundColor={color} />
      <Text fontSize={12} color="$neutral500">
        {label}
      </Text>
    </XStack>
  );
}

function AnalyticsScreenContent() {
  const tc = useTokenColor();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);
  const [headcountProjectId, setHeadcountProjectId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getActiveOrgId().then((id) => {
        setOrgId(id);
        setOrgChecked(true);
      });
    }, []),
  );

  const analyticsQuery = useQuery({
    queryKey: ['analytics', orgId],
    queryFn: () => fetchAnalyticsData(orgId as string),
    enabled: !!orgId,
  });

  const data = analyticsQuery.data;

  const activeProjects = useMemo(
    () => (data?.projects ?? []).filter((p) => p.status === 'active'),
    [data],
  );

  // Default the headcount chip selector to the first active project once
  // data arrives, without fighting a user's own subsequent selection.
  useEffect(() => {
    if (!headcountProjectId && activeProjects.length > 0) {
      setHeadcountProjectId(activeProjects[0]!.id);
    }
  }, [activeProjects, headcountProjectId]);

  // ---------------------------------------------------------------------
  // Financial §1 — cost vs. budget per active project (LIFETIME, see file
  // header). JUDGMENT CALL (§2.3 literally says "revenue vs. cost" — no
  // revenue/invoicing table exists anywhere in this schema, confirmed by
  // grepping every migration before writing this screen): substitutes
  // `budget_total` as a clearly-labeled budget-vs-actual comparison
  // instead, rather than silently renaming the mismatch away or dropping
  // the comparison entirely.
  // ---------------------------------------------------------------------
  const { costBars, budgetBars, costProjectsOmitted } = useMemo(() => {
    if (!data) return { costBars: [], budgetBars: [], costProjectsOmitted: 0 };
    const rateByWorker: Record<string, number> = {};
    data.workers.forEach((w) => {
      rateByWorker[w.id] = w.daily_rate ?? 0;
    });
    const expenseTotalByProject: Record<string, number> = {};
    data.expensesLifetimeActive.forEach((e) => {
      expenseTotalByProject[e.project_id] =
        (expenseTotalByProject[e.project_id] ?? 0) + Number(e.amount);
    });
    const payrollTotalByProject: Record<string, number> = {};
    data.attendanceLifetimeActive.forEach((r) => {
      if (!r.project_id) return;
      const value = ATTENDANCE_DAY_VALUE[r.status] ?? 0;
      const rate = rateByWorker[r.worker_id] ?? 0;
      payrollTotalByProject[r.project_id] =
        (payrollTotalByProject[r.project_id] ?? 0) + value * rate;
    });

    const rows = activeProjects
      .map((p) => ({
        label: p.name,
        cost: (expenseTotalByProject[p.id] ?? 0) + (payrollTotalByProject[p.id] ?? 0),
        budget: p.budget_total ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    const shown = rows.slice(0, MAX_BARS);
    return {
      costBars: shown.map((r) => ({ label: r.label, value: r.cost })),
      budgetBars: shown.map((r) => ({ label: r.label, value: r.budget })),
      costProjectsOmitted: rows.length,
    };
  }, [data, activeProjects]);

  // ---------------------------------------------------------------------
  // Financial §2 — monthly cash-out trend, 6 months, actual money leaving
  // the org (approved advances + project_expenses), NOT the payroll
  // LIABILITY dashboard.tsx's own sparkline computes (see file header —
  // this deliberately does not reuse that computation as-is).
  // ---------------------------------------------------------------------
  const cashOutLine = useMemo(() => {
    if (!data) return [];
    const months = trailingMonthKeys(6);
    const totals = new Map<string, number>(months.map((m) => [m, 0]));
    data.expensesWindowed.forEach((e) => {
      const key = e.expense_date.slice(0, 7);
      if (totals.has(key)) totals.set(key, totals.get(key)! + Number(e.amount));
    });
    data.advancesWindowed.forEach((a) => {
      const key = a.created_at.slice(0, 7);
      if (totals.has(key)) totals.set(key, totals.get(key)! + Number(a.amount));
    });
    return months.map((m) => ({ label: monthLabel(m), value: totals.get(m) ?? 0 }));
  }, [data]);

  // ---------------------------------------------------------------------
  // Workforce §1 — org-wide attendance-rate trend, 8 weeks. JUDGMENT
  // CALL: "resolved to present/half_day" is read as a CATEGORICAL
  // resolution rate — count(status IN present,half_day) / count(total) —
  // not the money-weighted 0.5-for-half-day value dashboard.tsx's
  // payroll sparkline uses. Different purpose (an attendance rate is a
  // presence percentage, not a pay amount), different formula; both are
  // correct for what they each measure. See PHASE_7_BRIEF.md §3.
  // ---------------------------------------------------------------------
  const attendanceRateLine = useMemo(() => {
    if (!data) return [];
    const weeks = trailingWeekStarts(8);
    const buckets = new Map<string, { resolved: number; total: number }>(
      weeks.map((w) => [w, { resolved: 0, total: 0 }]),
    );
    data.attendanceWindowed.forEach((r) => {
      const weekStart = cycleStartISO(new Date(r.record_date));
      const bucket = buckets.get(weekStart);
      if (!bucket) return; // outside the 8-week window (fetched 6mo, sliced to 8wk)
      bucket.total += 1;
      if (r.status === 'present' || r.status === 'half_day') bucket.resolved += 1;
    });
    return weeks.map((w) => {
      const b = buckets.get(w)!;
      const rate = b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0;
      return { label: weekLabel(w), value: rate };
    });
  }, [data]);

  // ---------------------------------------------------------------------
  // Workforce §2 — per-worker reliability, current pay cycle. Same
  // categorical formula as the trend above, applied per worker instead
  // of org-wide. Sorted worst-first (ascending) — the more useful signal
  // for a contractor scanning for a reliability problem — capped to
  // MAX_BARS.
  // ---------------------------------------------------------------------
  const { reliabilityBars, reliabilityOmitted } = useMemo(() => {
    if (!data) return { reliabilityBars: [], reliabilityOmitted: 0 };
    const cycleStart = cycleStartISO();
    const cycleEnd = cycleEndISO();
    const byWorker = new Map<string, { resolved: number; total: number }>();
    data.attendanceWindowed.forEach((r) => {
      if (r.record_date < cycleStart || r.record_date > cycleEnd) return;
      const b = byWorker.get(r.worker_id) ?? { resolved: 0, total: 0 };
      b.total += 1;
      if (r.status === 'present' || r.status === 'half_day') b.resolved += 1;
      byWorker.set(r.worker_id, b);
    });
    const nameById: Record<string, string> = {};
    data.workers.forEach((w) => {
      nameById[w.id] = w.full_name;
    });
    // Round 2 audit (§1.10) — sorted worst-first ON PURPOSE (see comment
    // above), but every bar rendered flat teal, so the worst performers
    // (the ones a manager most needs to notice) didn't stand out at all.
    // Reliability runs the OPPOSITE direction from Progress.tsx's
    // budget-consumed threshold (high % is GOOD here, not bad), so this
    // is its own threshold rather than a reuse of `thresholdColor()` —
    // reusing it as-is would have painted a 90% reliability bar amber.
    const reliabilityColor = (percent: number) => {
      if (percent < 70) return tc.danger;
      if (percent < 90) return tc.warning;
      return tc.success;
    };
    const rows = Array.from(byWorker.entries())
      .map(([workerId, b]) => {
        const value = b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0;
        return { label: nameById[workerId] ?? '—', value, color: reliabilityColor(value) };
      })
      .sort((a, b) => a.value - b.value);
    return {
      reliabilityBars: rows.slice(0, MAX_BARS),
      reliabilityOmitted: rows.length,
    };
  }, [data, tc]);

  // ---------------------------------------------------------------------
  // Workforce §3 — headcount by project, 8 weeks, ONE project at a time
  // via a chip selector (reusing the exact chip-row pattern
  // `expenses.tsx`'s project picker already established, rather than a
  // new selector component). JUDGMENT CALL: source is
  // `attendance_effective` (who actually worked), not
  // `dispatch_assignments` (who was scheduled) — the two can diverge (a
  // scheduled worker who never checked in, or a manual pointage entry
  // with no prior dispatch row), and "headcount" reads more naturally as
  // "who was actually on site" than "who was assigned."
  // ---------------------------------------------------------------------
  const headcountLine = useMemo(() => {
    if (!data || !headcountProjectId) return [];
    const weeks = trailingWeekStarts(8);
    const buckets = new Map<string, Set<string>>(weeks.map((w) => [w, new Set<string>()]));
    data.attendanceWindowed
      .filter((r) => r.project_id === headcountProjectId)
      .forEach((r) => {
        const weekStart = cycleStartISO(new Date(r.record_date));
        buckets.get(weekStart)?.add(r.worker_id);
      });
    return weeks.map((w) => ({ label: weekLabel(w), value: buckets.get(w)!.size }));
  }, [data, headcountProjectId]);

  // ---------------------------------------------------------------------
  // Projects §1 — budget-consumed distribution. Reuses lib/budget.ts's
  // EXISTING calculateConsumedTotal/calculateConsumedPercent unchanged
  // (expenses-only, lifetime — the established Doc 01 §1.14.2 ratio, same
  // one expenses.tsx already shows per-project). JUDGMENT CALL: BarChart
  // (one bar per project, % consumed), not DonutChart — a donut fits a
  // single whole broken into parts that sum to 100%; per-project percent-
  // consumed figures don't sum to anything meaningful, so a bar
  // comparison across projects fits better. Projects with no
  // `budget_total` set are excluded (nothing to compute a % against) and
  // counted in the caption below the chart.
  // ---------------------------------------------------------------------
  const { budgetConsumedBars, budgetConsumedExcluded, budgetConsumedOmitted } = useMemo(() => {
    if (!data)
      return { budgetConsumedBars: [], budgetConsumedExcluded: 0, budgetConsumedOmitted: 0 };
    const expensesByProject = new Map<string, { amount: number }[]>();
    data.expensesLifetimeActive.forEach((e) => {
      const list = expensesByProject.get(e.project_id) ?? [];
      list.push({ amount: e.amount });
      expensesByProject.set(e.project_id, list);
    });
    let excluded = 0;
    const rows: { label: string; value: number; color: string }[] = [];
    activeProjects.forEach((p) => {
      const percent = calculateConsumedPercent(
        calculateConsumedTotal(expensesByProject.get(p.id) ?? []),
        p.budget_total,
      );
      if (percent === null) {
        excluded += 1;
        return;
      }
      rows.push({ label: p.name, value: percent, color: thresholdColor(percent, tc) });
    });
    rows.sort((a, b) => b.value - a.value); // most-consumed (most at-risk) first
    return {
      budgetConsumedBars: rows.slice(0, MAX_BARS),
      budgetConsumedExcluded: excluded,
      budgetConsumedOmitted: rows.length,
    };
  }, [data, activeProjects, tc]);

  // ---------------------------------------------------------------------
  // Operations §1 — vehicle utilization, 30-day trailing window.
  // Days-in-use = distinct assignment_date per vehicle within the window;
  // days-available = window length (30). Not blocked by Phase 8's
  // maintenance-log work (confirmed in PHASE_7_BRIEF.md's Step 1 — that
  // gap is about a maintenance LOG, unrelated to utilization math).
  // ---------------------------------------------------------------------
  const { utilizationBars, utilizationOmitted } = useMemo(() => {
    if (!data) return { utilizationBars: [], utilizationOmitted: 0 };
    const nameById: Record<string, string> = {};
    data.vehicles.forEach((v) => {
      nameById[v.id] = v.name;
    });
    const daysByVehicle = new Map<string, Set<string>>();
    data.dispatchRecent.forEach((a) => {
      if (!a.vehicle_id) return;
      const set = daysByVehicle.get(a.vehicle_id) ?? new Set<string>();
      set.add(a.assignment_date);
      daysByVehicle.set(a.vehicle_id, set);
    });
    // Round 2 audit (§1.10) — utilization thresholds are a fleet-ops
    // definition, not a visual one, so these bands were confirmed with
    // Hazem rather than invented unilaterally: <30% underused (idle
    // capital, amber), 30-85% healthy (green), >85% overbooked (a vehicle
    // that's a likely bottleneck, red). Revisit once real multi-month
    // usage data exists to validate these numbers against actual fleet
    // behavior — they're a reasonable starting point, not a measured fact.
    const utilizationColor = (percent: number) => {
      if (percent > 85) return tc.danger;
      if (percent < 30) return tc.warning;
      return tc.success;
    };
    const rows = data.vehicles
      .map((v) => {
        const value = Math.round(((daysByVehicle.get(v.id)?.size ?? 0) / 30) * 100);
        return { label: v.name, value, color: utilizationColor(value) };
      })
      .sort((a, b) => b.value - a.value);
    return { utilizationBars: rows.slice(0, MAX_BARS), utilizationOmitted: rows.length };
  }, [data, tc]);

  // ---------------------------------------------------------------------
  // Operations §2 — safety incident trend by severity, 6 months. Three
  // stacked single-series BarCharts (see file header on why, not a
  // grouped/stacked single chart). Always month-bucketed — this screen's
  // window is fixed at 6 months (> generate-report's own 60-day
  // month-bucketing threshold), so the >60-day conditional that function
  // uses doesn't need mirroring here; the window is always long enough
  // to warrant months.
  // ---------------------------------------------------------------------
  const { minorBars, moderateBars, severeBars } = useMemo(() => {
    if (!data) return { minorBars: [], moderateBars: [], severeBars: [] };
    const months = trailingMonthKeys(6);
    const counts = new Map<string, { minor: number; moderate: number; severe: number }>(
      months.map((m) => [m, { minor: 0, moderate: 0, severe: 0 }]),
    );
    data.safetyWindowed.forEach((incident) => {
      const key = incident.created_at.slice(0, 7);
      const bucket = counts.get(key);
      if (!bucket) return;
      if (
        incident.severity === 'minor' ||
        incident.severity === 'moderate' ||
        incident.severity === 'severe'
      ) {
        bucket[incident.severity] += 1;
      }
    });
    return {
      minorBars: months.map((m) => ({ label: monthLabel(m), value: counts.get(m)!.minor })),
      moderateBars: months.map((m) => ({ label: monthLabel(m), value: counts.get(m)!.moderate })),
      severeBars: months.map((m) => ({ label: monthLabel(m), value: counts.get(m)!.severe })),
    };
  }, [data]);

  const hasAnySafetyIncident = (data?.safetyWindowed.length ?? 0) > 0;

  if (!orgChecked || (orgId && analyticsQuery.isLoading)) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <Header />
        <YStack flex={1} paddingHorizontal="$4">
          <SkeletonList rows={5} />
        </YStack>
      </YStack>
    );
  }

  if (analyticsQuery.isError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <Header />
        <ErrorState icon3d="warning-circle" onRetry={() => analyticsQuery.refetch()} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <Header />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={analyticsQuery.isRefetching}
            onRefresh={() => analyticsQuery.refetch()}
          />
        }
      >
        {/* ---------------- Financier ---------------- */}
        <SectionLabel label="Financier" />
        <YStack gap="$3">
          <ChartCard
            title="Budget vs coût réel"
            subtitle="Chantiers actifs, cumul depuis le début"
            icon={CoinsIcon}
            iconTint={tc.accent600}
          >
            {costBars.length === 0 ? (
              <ChartEmpty />
            ) : (
              <YStack gap="$3">
                <XStack gap="$4">
                  <LegendDot color={tc.accent600} label="Coût réel (dépenses + main-d'œuvre)" />
                </XStack>
                <BarChart data={costBars} tintColor={tc.accent600} emphasizeLast={false} />
                <XStack gap="$4" marginTop="$1">
                  <LegendDot color={tc.neutral300} label="Budget alloué" />
                </XStack>
                <BarChart data={budgetBars} tintColor={tc.neutral300} emphasizeLast={false} />
                <CappedNote shown={costBars.length} total={costProjectsOmitted} />
              </YStack>
            )}
          </ChartCard>

          <ChartCard
            title="Sorties de trésorerie"
            subtitle="6 derniers mois — avances approuvées + dépenses"
            icon={CoinsIcon}
            iconTint={tc.accent600}
          >
            {cashOutLine.length < 2 ? <ChartEmpty /> : <LineChart data={cashOutLine} />}
          </ChartCard>
        </YStack>

        {/* ---------------- Main-d'œuvre ---------------- */}
        <SectionLabel label="Main-d'œuvre" />
        <YStack gap="$3">
          <ChartCard
            title="Taux de présence"
            subtitle="8 dernières semaines, toute l'organisation"
            icon={UsersIcon}
            iconTint={tc.categoricalBlue}
          >
            {attendanceRateLine.length < 2 ? (
              <ChartEmpty />
            ) : (
              <LineChart data={attendanceRateLine} />
            )}
          </ChartCard>

          <ChartCard
            title="Fiabilité par ouvrier"
            subtitle="Cycle de paie en cours, du moins au plus fiable"
            icon={UsersIcon}
            iconTint={tc.categoricalBlue}
          >
            {reliabilityBars.length === 0 ? (
              <ChartEmpty />
            ) : (
              <YStack>
                <BarChart data={reliabilityBars} tintColor={tc.accent600} emphasizeLast={false} />
                <CappedNote shown={reliabilityBars.length} total={reliabilityOmitted} />
              </YStack>
            )}
          </ChartCard>

          <ChartCard
            title="Effectif par chantier"
            subtitle="8 dernières semaines — présences réelles, pas la planification"
            icon={UsersIcon}
            iconTint={tc.categoricalBlue}
          >
            {activeProjects.length === 0 ? (
              <ChartEmpty />
            ) : (
              <YStack gap="$3">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$2">
                    {activeProjects.map((p) => {
                      const active = p.id === headcountProjectId;
                      const meta = getProjectTypeMeta(p.project_type);
                      const TypeIcon = meta.icon;
                      const tint = tc[meta.colorKey];
                      return (
                        <XStack
                          key={p.id}
                          paddingVertical={7}
                          paddingHorizontal={14}
                          borderRadius={999}
                          backgroundColor={active ? tint : toRgba(tint, 0.12)}
                          alignItems="center"
                          gap={5}
                          onPress={() => setHeadcountProjectId(p.id)}
                        >
                          <TypeIcon size={13} weight="fill" color={active ? tc.neutral0 : tint} />
                          <Text
                            fontSize={13.5}
                            fontWeight="500"
                            color={active ? 'white' : '$neutral900'}
                          >
                            {p.name}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </ScrollView>
                {headcountLine.length < 2 ? <ChartEmpty /> : <LineChart data={headcountLine} />}
              </YStack>
            )}
          </ChartCard>
        </YStack>

        {/* ---------------- Chantiers ---------------- */}
        <SectionLabel label="Chantiers" />
        <YStack gap="$3">
          <ChartCard
            title="Budget consommé"
            subtitle="% du budget alloué déjà dépensé, chantiers actifs"
            icon={BuildingsIcon}
            iconTint={tc.categoricalViolet}
          >
            {budgetConsumedBars.length === 0 ? (
              <ChartEmpty />
            ) : (
              <YStack>
                <BarChart
                  data={budgetConsumedBars}
                  tintColor={tc.accent600}
                  emphasizeLast={false}
                  valueFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <CappedNote shown={budgetConsumedBars.length} total={budgetConsumedOmitted} />
                {budgetConsumedExcluded > 0 && (
                  <Text fontSize={11.5} color="$neutral500" marginTop="$1">
                    {budgetConsumedExcluded} chantier(s) sans budget défini, exclu(s).
                  </Text>
                )}
              </YStack>
            )}
          </ChartCard>
        </YStack>

        {/* ---------------- Opérations ---------------- */}
        <SectionLabel label="Opérations" />
        <YStack gap="$3">
          <ChartCard
            title="Taux d'utilisation des véhicules"
            subtitle="30 derniers jours"
            icon={TruckIcon}
            iconTint={tc.categoricalAmber}
          >
            {utilizationBars.length === 0 ? (
              <ChartEmpty />
            ) : (
              <YStack>
                <BarChart
                  data={utilizationBars}
                  tintColor={tc.accent600}
                  emphasizeLast={false}
                  valueFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <CappedNote shown={utilizationBars.length} total={utilizationOmitted} />
              </YStack>
            )}
          </ChartCard>

          <ChartCard
            title="Incidents de sécurité par gravité"
            subtitle="6 derniers mois"
            icon={TruckIcon}
            iconTint={tc.categoricalAmber}
          >
            {!hasAnySafetyIncident ? (
              <ChartEmpty />
            ) : (
              <YStack gap="$3">
                <XStack gap="$4" flexWrap="wrap">
                  <LegendDot color={tc.success} label="Mineur" />
                  <LegendDot color={tc.warning} label="Modéré" />
                  <LegendDot color={tc.danger} label="Grave" />
                </XStack>
                <BarChart
                  data={minorBars}
                  tintColor={tc.success}
                  emphasizeLast={false}
                  height={100}
                />
                <BarChart
                  data={moderateBars}
                  tintColor={tc.warning}
                  emphasizeLast={false}
                  height={100}
                />
                <BarChart
                  data={severeBars}
                  tintColor={tc.danger}
                  emphasizeLast={false}
                  height={100}
                />
              </YStack>
            )}
          </ChartCard>
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text fontFamily="$display" fontSize={15} fontWeight="600" color="$neutral900">
      {label}
    </Text>
  );
}

function Header() {
  const tc = useTokenColor();
  return (
    <XStack alignItems="center" gap="$3" paddingTop={56} paddingHorizontal="$4" paddingBottom="$3">
      <XStack onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Retour">
        <ArrowLeftIcon size={22} color={tc.neutral900} />
      </XStack>
      <Text fontFamily="$display" fontSize={18} fontWeight="600">
        Analyses
      </Text>
    </XStack>
  );
}

/**
 * Viewers (Observateur) are money-blind since migration 0103 — see MoneyGate.
 */
export default function AnalyticsScreen() {
  return (
    <MoneyGate title="Analyses">
      <AnalyticsScreenContent />
    </MoneyGate>
  );
}

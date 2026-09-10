'use client';

import type { AttendanceStatus, Project } from '@dala/shared-types';
import { ErrorState, PageHero } from '@dala/ui-web';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { BarChart, LineChart, type ChartPoint } from '@/components/ui/Chart';
import { calculateConsumedPercent, calculateConsumedTotal, thresholdColor } from '@/lib/budget';
import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/app/(contractor)/analytics/AnalyticsView.tsx
 *
 * Gap-closure guide §1.10 — ported from apps/mobile/src/app/(contractor)/
 * analytics.tsx (825 lines, read in full before starting). Every window,
 * formula, threshold, and judgment call below is carried over from that
 * file's own comments UNCHANGED — this header only summarizes; the
 * reasoning lives at each computation, same as mobile.
 *
 * Simplification made on web, stated rather than silently done: the
 * headcount-by-project chip selector drops mobile's per-project-type
 * icon/color styling (`getProjectTypeMeta`) — that's purely a visual
 * nicety with no web equivalent helper, and building one just for this
 * one chip row wasn't worth the scope. Chips here are plain
 * name-only toggles.
 */

// Doc 01 §1.14 categorical attendance value — present=1, half_day=0.5,
// absent=0. Used only for the lifetime payroll-liability estimate below,
// never for the attendance-RATE trend (that one's a different, categorical
// resolved/total formula — see attendanceRateLine).
const ATTENDANCE_DAY_VALUE: Record<AttendanceStatus, number> = {
  present: 1,
  absent: 0,
  half_day: 0.5,
};

// BarChart has no horizontal scroll — beyond ~10 bars, labels/values
// become unreadable. Same cap mobile uses, same "N sur M affichés" caption
// pattern for whatever's cut off.
const MAX_BARS = 10;

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgoISO(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

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

// Monday-start week, matching cycleStartISO's boundary everywhere else in
// this app (salary cycles, dispatch week).
function cycleStartISO(reference: Date = new Date()): string {
  const day = reference.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(reference);
  monday.setDate(reference.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

function cycleEndISO(reference: Date = new Date()): string {
  const start = new Date(cycleStartISO(reference));
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

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
  attendanceWindowed: AttendanceRow[];
  attendanceLifetimeActive: AttendanceRow[];
  expensesWindowed: { project_id: string; amount: number; expense_date: string }[];
  expensesLifetimeActive: { project_id: string; amount: number }[];
  advancesWindowed: { amount: number; created_at: string }[];
  dispatchRecent: { vehicle_id: string | null; assignment_date: string }[];
  safetyWindowed: { severity: string; created_at: string }[];
}

const TC = {
  accent600: '#0F9D8E',
  categoricalBlue: '#6E93E0',
  neutral300: '#DADDE1',
  success: '#1F9254',
  warning: '#C08A1E',
  danger: '#C0433D',
};

function ChartEmpty() {
  return (
    <p className="py-3 text-center text-[13px] text-neutral-500">
      Aucune donnée pour cette période.
    </p>
  );
}

function CappedNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="mt-1 text-[11.5px] text-neutral-500">
      {shown} sur {total} affichés.
    </p>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-neutral-500">{label}</span>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">{label}</p>
  );
}

export function AnalyticsView({ orgId }: { orgId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [headcountProjectId, setHeadcountProjectId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const supabase = createClient();
        const sixMonthsAgo = monthsAgoISO(6);
        const thirtyDaysAgo = daysAgoISO(30);

        const [
          { data: workers, error: workersErr },
          { data: projects, error: projectsErr },
          { data: vehicles, error: vehiclesErr },
        ] = await Promise.all([
          supabase
            .from('workers')
            .select('id, full_name, daily_rate')
            .eq('org_id', orgId)
            .is('deleted_at', null),
          supabase.from('projects').select('*').eq('lead_org_id', orgId).is('deleted_at', null),
          supabase.from('vehicles').select('id, name').eq('org_id', orgId),
        ]);
        if (workersErr || projectsErr || vehiclesErr) {
          if (!cancelled) setError(true);
          return;
        }

        const activeProjectIds = (projects ?? [])
          .filter((p) => p.status === 'active')
          .map((p) => p.id);

        const [
          { data: attendanceWindowed, error: attendanceWindowedErr },
          { data: attendanceLifetimeActive, error: attendanceLifetimeErr },
          { data: expensesWindowed, error: expensesWindowedErr },
          { data: expensesLifetimeActive, error: expensesLifetimeErr },
          { data: advancesWindowed, error: advancesErr },
          { data: dispatchRecent, error: dispatchErr },
          { data: safetyWindowed, error: safetyErr },
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
            : Promise.resolve({ data: [] as AttendanceRow[], error: null }),
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
            : Promise.resolve({
                data: [] as { project_id: string; amount: number }[],
                error: null,
              }),
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

        if (
          attendanceWindowedErr ||
          attendanceLifetimeErr ||
          expensesWindowedErr ||
          expensesLifetimeErr ||
          advancesErr ||
          dispatchErr ||
          safetyErr
        ) {
          if (!cancelled) setError(true);
          return;
        }

        if (cancelled) return;
        setData({
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
        });
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, reloadKey]);

  const activeProjects = useMemo(
    () => (data?.projects ?? []).filter((p) => p.status === 'active'),
    [data],
  );

  useEffect(() => {
    if (!headcountProjectId && activeProjects.length > 0) {
      setHeadcountProjectId(activeProjects[0]!.id);
    }
  }, [activeProjects, headcountProjectId]);

  // Financier §1 — cost vs. budget per active project, LIFETIME. No
  // revenue/invoicing table exists anywhere in this schema (confirmed by
  // grepping every migration) — substitutes budget_total as a clearly-
  // labeled budget-vs-actual comparison rather than silently renaming the
  // mismatch away.
  const { costBars, budgetBars, costProjectsOmitted } = useMemo(() => {
    if (!data)
      return {
        costBars: [] as ChartPoint[],
        budgetBars: [] as ChartPoint[],
        costProjectsOmitted: 0,
      };
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

  // Financier §2 — monthly cash-out trend, 6 months: approved advances +
  // project_expenses. NOT the payroll LIABILITY the dashboard's own
  // sparkline computes — deliberately a different figure (money that
  // actually left vs. money owed).
  const cashOutLine = useMemo<ChartPoint[]>(() => {
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

  // Main-d'œuvre §1 — org-wide attendance-RATE trend, 8 weeks. Categorical
  // resolved/total (present+half_day count as 1 "resolved" each here), NOT
  // the money-weighted 0.5-for-half-day value used above — different
  // purpose (a presence percentage vs. a pay amount), different formula.
  const attendanceRateLine = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    const weeks = trailingWeekStarts(8);
    const buckets = new Map<string, { resolved: number; total: number }>(
      weeks.map((w) => [w, { resolved: 0, total: 0 }]),
    );
    data.attendanceWindowed.forEach((r) => {
      const weekStart = cycleStartISO(new Date(r.record_date));
      const bucket = buckets.get(weekStart);
      if (!bucket) return;
      bucket.total += 1;
      if (r.status === 'present' || r.status === 'half_day') bucket.resolved += 1;
    });
    return weeks.map((w) => {
      const b = buckets.get(w)!;
      const rate = b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0;
      return { label: weekLabel(w), value: rate };
    });
  }, [data]);

  // Main-d'œuvre §2 — per-worker reliability, current pay cycle, sorted
  // worst-first (the useful direction for spotting a problem). Own
  // threshold, opposite direction from budget's thresholdColor (high % is
  // GOOD here) — reusing that one as-is would paint a 90% reliability bar
  // amber.
  const { reliabilityBars, reliabilityOmitted } = useMemo(() => {
    if (!data) return { reliabilityBars: [] as ChartPoint[], reliabilityOmitted: 0 };
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
    const reliabilityColor = (percent: number) => {
      if (percent < 70) return TC.danger;
      if (percent < 90) return TC.warning;
      return TC.success;
    };
    const rows = Array.from(byWorker.entries())
      .map(([workerId, b]) => {
        const value = b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0;
        return { label: nameById[workerId] ?? '—', value, color: reliabilityColor(value) };
      })
      .sort((a, b) => a.value - b.value);
    return { reliabilityBars: rows.slice(0, MAX_BARS), reliabilityOmitted: rows.length };
  }, [data]);

  // Main-d'œuvre §3 — headcount by project, 8 weeks, one project at a time
  // via chip selector. Source is attendance_effective (who actually
  // worked), not dispatch_assignments (who was scheduled) — "headcount"
  // reads as "who was on site," not "who was assigned."
  const headcountLine = useMemo<ChartPoint[]>(() => {
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

  // Chantiers §1 — budget-consumed distribution. Reuses lib/budget.ts's
  // calculateConsumedTotal/calculateConsumedPercent unchanged (expenses-
  // only, lifetime). A bar chart, not a donut: per-project percent-
  // consumed figures don't sum to anything meaningful across projects, so
  // a donut (whole broken into parts) doesn't fit; a bar comparison does.
  const { budgetConsumedBars, budgetConsumedExcluded, budgetConsumedOmitted } = useMemo(() => {
    if (!data) {
      return {
        budgetConsumedBars: [] as ChartPoint[],
        budgetConsumedExcluded: 0,
        budgetConsumedOmitted: 0,
      };
    }
    const expensesByProject = new Map<string, { amount: number }[]>();
    data.expensesLifetimeActive.forEach((e) => {
      const list = expensesByProject.get(e.project_id) ?? [];
      list.push({ amount: e.amount });
      expensesByProject.set(e.project_id, list);
    });
    let excluded = 0;
    const rows: ChartPoint[] = [];
    activeProjects.forEach((p) => {
      const percent = calculateConsumedPercent(
        calculateConsumedTotal(expensesByProject.get(p.id) ?? []),
        p.budget_total,
      );
      if (percent === null) {
        excluded += 1;
        return;
      }
      rows.push({ label: p.name, value: percent, color: thresholdColor(percent, TC) });
    });
    rows.sort((a, b) => b.value - a.value);
    return {
      budgetConsumedBars: rows.slice(0, MAX_BARS),
      budgetConsumedExcluded: excluded,
      budgetConsumedOmitted: rows.length,
    };
  }, [data, activeProjects]);

  // Opérations §1 — vehicle utilization, 30-day trailing window. Days-in-
  // use = distinct assignment_date per vehicle / 30 days available.
  // Thresholds are a fleet-ops definition confirmed with Hazem (not
  // invented unilaterally): <30% underused (amber), 30-85% healthy
  // (green), >85% overbooked/bottleneck (red).
  const { utilizationBars, utilizationOmitted } = useMemo(() => {
    if (!data) return { utilizationBars: [] as ChartPoint[], utilizationOmitted: 0 };
    const daysByVehicle = new Map<string, Set<string>>();
    data.dispatchRecent.forEach((a) => {
      if (!a.vehicle_id) return;
      const set = daysByVehicle.get(a.vehicle_id) ?? new Set<string>();
      set.add(a.assignment_date);
      daysByVehicle.set(a.vehicle_id, set);
    });
    const utilizationColor = (percent: number) => {
      if (percent > 85) return TC.danger;
      if (percent < 30) return TC.warning;
      return TC.success;
    };
    const rows = data.vehicles
      .map((v) => {
        const value = Math.round(((daysByVehicle.get(v.id)?.size ?? 0) / 30) * 100);
        return { label: v.name, value, color: utilizationColor(value) };
      })
      .sort((a, b) => b.value - a.value);
    return { utilizationBars: rows.slice(0, MAX_BARS), utilizationOmitted: rows.length };
  }, [data]);

  // Opérations §2 — safety incident trend by severity, 6 months. Three
  // separate single-series bar charts (minor/moderate/severe), not one
  // grouped/stacked chart — this Chart.tsx port has no grouped-bar mode,
  // same as mobile's.
  const { minorBars, moderateBars, severeBars } = useMemo(() => {
    if (!data)
      return {
        minorBars: [] as ChartPoint[],
        moderateBars: [] as ChartPoint[],
        severeBars: [] as ChartPoint[],
      };
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

  if (loading) {
    return (
      <>
        <PageHero eyebrow="Analyses" title="Analytique" description="Chargement des analyses…" />
        <p className="text-sm text-neutral-500">Chargement…</p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHero
          eyebrow="Analyses"
          title="Analytique"
          description="Une erreur est survenue lors du chargement."
        />
        <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
      </>
    );
  }

  return (
    <>
      <PageHero
        eyebrow="Analyses"
        title="Analytique"
        description="Tendances financières, main-d'œuvre, chantiers et opérations pour votre organisation."
      />

      <SectionLabel label="Financier" />
      <div className="flex flex-col gap-4">
        <SectionCard
          title="Budget vs coût réel"
          description="Chantiers actifs, cumul depuis le début"
        >
          {costBars.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="flex flex-col gap-3">
              <LegendDot color={TC.accent600} label="Coût réel (dépenses + main-d'œuvre)" />
              <BarChart data={costBars} tintColor={TC.accent600} emphasizeLast={false} />
              <LegendDot color={TC.neutral300} label="Budget alloué" />
              <BarChart data={budgetBars} tintColor={TC.neutral300} emphasizeLast={false} />
              <CappedNote shown={costBars.length} total={costProjectsOmitted} />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Sorties de trésorerie"
          description="6 derniers mois — avances approuvées + dépenses"
        >
          {cashOutLine.length < 2 ? (
            <ChartEmpty />
          ) : (
            <LineChart data={cashOutLine} tintColor={TC.accent600} />
          )}
        </SectionCard>
      </div>

      <SectionLabel label="Main-d'œuvre" />
      <div className="flex flex-col gap-4">
        <SectionCard
          title="Taux de présence"
          description="8 dernières semaines, toute l'organisation"
        >
          {attendanceRateLine.length < 2 ? (
            <ChartEmpty />
          ) : (
            <LineChart data={attendanceRateLine} tintColor={TC.categoricalBlue} />
          )}
        </SectionCard>

        <SectionCard
          title="Fiabilité par ouvrier"
          description="Cycle de paie en cours, du moins au plus fiable"
        >
          {reliabilityBars.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div>
              <BarChart data={reliabilityBars} tintColor={TC.accent600} emphasizeLast={false} />
              <CappedNote shown={reliabilityBars.length} total={reliabilityOmitted} />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Effectif par chantier"
          description="8 dernières semaines — présences réelles, pas la planification"
        >
          {activeProjects.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {activeProjects.map((p) => {
                  const active = p.id === headcountProjectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setHeadcountProjectId(p.id)}
                      className={`rounded-2xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-accent-600 border-accent-600 text-white'
                          : 'border-neutral-300 text-neutral-900 hover:border-neutral-400'
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              {headcountLine.length < 2 ? (
                <ChartEmpty />
              ) : (
                <LineChart data={headcountLine} tintColor={TC.categoricalBlue} />
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionLabel label="Chantiers" />
      <div className="flex flex-col gap-4">
        <SectionCard title="Budget consommé" description="Chantiers actifs avec un budget défini">
          {budgetConsumedBars.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div>
              <BarChart
                data={budgetConsumedBars}
                tintColor={TC.accent600}
                emphasizeLast={false}
                valueFormatter={(v) => `${v}%`}
              />
              <CappedNote shown={budgetConsumedBars.length} total={budgetConsumedOmitted} />
              {budgetConsumedExcluded > 0 && (
                <p className="mt-1 text-[11.5px] text-neutral-500">
                  {budgetConsumedExcluded} chantier(s) sans budget défini, exclu(s).
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionLabel label="Opérations" />
      <div className="flex flex-col gap-4">
        <SectionCard title="Utilisation des véhicules" description="30 derniers jours">
          {utilizationBars.length === 0 ? (
            <ChartEmpty />
          ) : (
            <div>
              <BarChart
                data={utilizationBars}
                tintColor={TC.accent600}
                emphasizeLast={false}
                valueFormatter={(v) => `${v}%`}
              />
              <CappedNote shown={utilizationBars.length} total={utilizationOmitted} />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Incidents de sécurité" description="6 derniers mois, par gravité">
          {!hasAnySafetyIncident ? (
            <ChartEmpty />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <LegendDot color={TC.success} label="Mineurs" />
                <BarChart data={minorBars} tintColor={TC.success} emphasizeLast={false} />
              </div>
              <div>
                <LegendDot color={TC.warning} label="Modérés" />
                <BarChart data={moderateBars} tintColor={TC.warning} emphasizeLast={false} />
              </div>
              <div>
                <LegendDot color={TC.danger} label="Graves" />
                <BarChart data={severeBars} tintColor={TC.danger} emphasizeLast={false} />
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

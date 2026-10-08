'use client';

import type { Project } from '@dala/shared-types';
import { EmptyState, ErrorState } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { CaretLeftIcon, CaretRightIcon, TruckIcon, UsersThreeIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

interface DayProjectSummary {
  projectId: string;
  projectName: string;
  workerCount: number;
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

// Monday-start week — matches the app's French-locale convention
// elsewhere (mobile's own dispatch-week.tsx cites journal.tsx's
// date-grouped sections for this same precedent).
function startOfWeek(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}

function frDayLabel(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
    day: String(d.getDate()),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
  };
}

export function DispatchWeekView({ orgId }: { orgId: string }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toISO(new Date())));
  const [assignments, setAssignments] = useState<
    { assignment_date: string; project_id: string | null; worker_id: string | null }[]
  >([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — neither query below had its error captured; a
  // failed fetch previously rendered as an empty week, indistinguishable
  // from a genuinely unplanned one.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayISO = toISO(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const supabase = createClient();

    void Promise.all([
      supabase
        .from('dispatch_assignments')
        .select('assignment_date, project_id, worker_id')
        .eq('org_id', orgId)
        .gte('assignment_date', weekStart)
        .lte('assignment_date', weekEnd),
      supabase.from('active_projects').select('*').eq('lead_org_id', orgId),
    ]).then(
      ([{ data: rows, error: assignmentsError }, { data: projects, error: projectsError }]) => {
        if (cancelled) return;
        if (assignmentsError || projectsError) {
          setLoadError(true);
          setLoading(false);
          return;
        }
        setAssignments(rows ?? []);
        setProjectsById(Object.fromEntries((projects ?? []).map((p: Project) => [p.id, p])));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [orgId, weekStart, weekEnd, reloadKey]);

  // Same Set-per-(day,project) shape as mobile: a worker double-booked
  // across two lanes the same day/project still counts once.
  const summaryByDay = useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>();
    for (const a of assignments) {
      if (!a.project_id) continue;
      if (!map.has(a.assignment_date)) map.set(a.assignment_date, new Map());
      const byProject = map.get(a.assignment_date)!;
      if (!byProject.has(a.project_id)) byProject.set(a.project_id, new Set());
      if (a.worker_id) byProject.get(a.project_id)!.add(a.worker_id);
    }
    const result: Record<string, DayProjectSummary[]> = {};
    for (const [date, byProject] of map.entries()) {
      result[date] = Array.from(byProject.entries())
        .map(([projectId, workers]) => ({
          projectId,
          projectName: projectsById[projectId]?.name ?? 'Chantier',
          workerCount: workers.size,
        }))
        .sort((a, b) => b.workerCount - a.workerCount);
    }
    return result;
  }, [assignments, projectsById]);

  const weekLabel = useMemo(() => {
    const s = frDayLabel(weekStart);
    const e = frDayLabel(weekEnd);
    return `${s.day} ${s.month} – ${e.day} ${e.month}`;
  }, [weekStart, weekEnd]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={TruckIcon}
        title="Vue semaine"
        description="Nombre d'ouvriers affectés par chantier, jour par jour — repérez un chantier sous-staffé sans ouvrir chaque jour individuellement."
        actions={
          <Link href="/dispatch" className="text-accent-600 text-sm font-medium">
            Retour au tableau
          </Link>
        }
      />

      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="Semaine précédente"
          className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
        >
          <CaretLeftIcon size={18} />
        </button>
        <p className="text-sm font-semibold text-neutral-900">{weekLabel}</p>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="Semaine suivante"
          className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
        >
          <CaretRightIcon size={18} />
        </button>
      </div>

      <SectionCard title="Effectifs par chantier">
        {loading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : loadError ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {days.map((day) => {
              const summaries = summaryByDay[day] ?? [];
              const isToday = day === todayISO;
              return (
                <Link
                  key={day}
                  href={`/dispatch?date=${day}`}
                  className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors hover:border-neutral-300 ${
                    isToday ? 'border-accent-300 bg-accent-50' : 'border-neutral-100'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    {frDayLabel(day).weekday} {frDayLabel(day).day} {frDayLabel(day).month}
                  </p>
                  {summaries.length === 0 ? (
                    <p className="text-xs text-neutral-400">Aucune affectation</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {summaries.map((s) => (
                        <div key={s.projectId} className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-neutral-700">{s.projectName}</span>
                          <span
                            className={`text-xs font-semibold ${
                              s.workerCount === 0 ? 'text-danger' : 'text-neutral-900'
                            }`}
                          >
                            {s.workerCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {!loading && !loadError && Object.keys(summaryByDay).length === 0 && (
          <EmptyState
            icon={UsersThreeIcon}
            title="Aucune affectation cette semaine"
            description="Planifiez un dispatch pour voir les effectifs par chantier ici."
          />
        )}
      </SectionCard>
    </div>
  );
}

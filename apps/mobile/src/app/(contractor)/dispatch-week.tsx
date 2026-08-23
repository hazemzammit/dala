import type { Project } from '@dala/shared-types';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { WeatherStrip } from '@/components/dispatch/WeatherStrip';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/dispatch-week.tsx
 *
 * IMPROVEMENT-PLAN PHASE 9 §2.4 "Calendar/planning view."
 *
 * STEP 1 FINDING that shaped this screen, stated plainly: dispatch.tsx
 * already had MORE built than the plan's own gap text ("only shows
 * 'today'") described — a 14-day horizontal date-chip strip with density
 * dots (added in a later UI/UX pass, confirmed by reading dispatch.tsx's
 * own `dateChips()`/density-dot JSX before writing this) already lets a
 * manager switch to any day in a 2-week window and see a dot for which
 * days already have assignments. What that strip does NOT do — and what
 * this screen adds — is show more than one day's worth of assignment
 * DETAIL at once: today, seeing "is Wednesday short-staffed" still means
 * tapping into Wednesday. This screen is the actual week-at-a-glance
 * gap: 7 days, side by side, each showing which projects have how many
 * workers assigned, so a genuine staffing GAP (a project with zero
 * assigned workers three days out) is visible without tapping through
 * every day individually.
 *
 * DELIBERATELY NOT a retrofit of dispatch.tsx into a 7-column grid —
 * that file's own header (Phase 11) already states a considered-and-
 * declined decision along exactly these lines for project-scoped mode:
 * "this screen has no 'week' concept to scope to... not inventing a
 * Monday–Sunday grid that doesn't exist anywhere else in this app." This
 * screen doesn't reverse that decision — it's a NEW, separate, read-only
 * planning surface, reached via "Vue semaine" from the global (non-
 * project-scoped) board only, and tapping a day here navigates INTO
 * dispatch.tsx (`?date=`) for the existing full lane-based detail/editing
 * view rather than reimplementing editing inline in a 7-column grid.
 *
 * READ-ONLY BY DESIGN: this is a summary/navigation screen, not an
 * editing surface — assigning/removing a worker still happens in
 * dispatch.tsx's own detail view, reached by tapping a day here.
 *
 * Client-side aggregation, no new RPC: a single `dispatch_assignments`
 * range query for the 7-day window (RLS already permits this — the same
 * `dispatch_assignments_select_member` policy dispatch.tsx's own queries
 * already rely on, confirmed by reading it before deciding this needed no
 * new backend surface), grouped by (day, project) client-side.
 */

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

// Monday-start week, matching this app's French-locale convention
// elsewhere (journal.tsx's date-grouped sections use the same
// Monday-first week boundary — grepped before writing this rather than
// assuming Sunday-start).
function startOfWeek(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}

function frWeekdayLabel(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  return { weekday, day: String(d.getDate()), month };
}

interface DayProjectSummary {
  projectId: string;
  projectName: string;
  workerCount: number;
}

export default function DispatchWeekScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toISO(new Date())));
  const [assignments, setAssignments] = useState<
    { assignment_date: string; project_id: string | null; worker_id: string | null }[]
  >([]);
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayISO = toISO(new Date());

  const load = useCallback(async (org: string, from: string, to: string) => {
    const [{ data: rows }, { data: projects }] = await Promise.all([
      supabase
        .from('dispatch_assignments')
        .select('assignment_date, project_id, worker_id')
        .eq('org_id', org)
        .gte('assignment_date', from)
        .lte('assignment_date', to),
      supabase.from('active_projects').select('*').eq('lead_org_id', org),
    ]);
    setAssignments(rows ?? []);
    setProjectsById(Object.fromEntries((projects ?? []).map((p: Project) => [p.id, p])));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void getActiveOrgId().then(async (id) => {
        if (cancelled) return;
        setOrgId(id);
        if (id) await load(id, weekStart, weekEnd);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [weekStart, weekEnd, load]),
  );

  async function handleRefresh() {
    if (!orgId) return;
    setRefreshing(true);
    await load(orgId, weekStart, weekEnd);
    setRefreshing(false);
  }

  // Per-day, per-project worker counts — a Set per (day, project) so the
  // same worker double-booked across two lanes on the same day/project
  // (shouldn't happen given dispatch.tsx's own overbooking checks, but
  // this screen doesn't re-validate that, only displays what's there)
  // still counts once, not once per row.
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
    const s = frWeekdayLabel(weekStart);
    const e = frWeekdayLabel(weekEnd);
    return `${s.day} ${s.month} – ${e.day} ${e.month}`;
  }, [weekStart, weekEnd]);

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack
        alignItems="center"
        gap="$3"
        paddingHorizontal="$4"
        paddingTop="$2"
        paddingBottom="$2"
      >
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600" flex={1}>
          Vue semaine
        </Text>
      </XStack>

      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$4"
        paddingBottom="$3"
      >
        <XStack
          padding="$2"
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          accessibilityRole="button"
          accessibilityLabel="Semaine précédente"
        >
          <CaretLeftIcon size={20} />
        </XStack>
        <Text fontSize={15} fontWeight="600">
          {weekLabel}
        </Text>
        <XStack
          padding="$2"
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          accessibilityRole="button"
          accessibilityLabel="Semaine suivante"
        >
          <CaretRightIcon size={20} />
        </XStack>
      </XStack>

      <WeatherStrip />

      {loading ? (
        <SkeletonCardList cards={4} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          {days.map((iso) => {
            const { weekday, day, month } = frWeekdayLabel(iso);
            const projectSummaries = summaryByDay[iso] ?? [];
            const totalWorkers = projectSummaries.reduce((sum, p) => sum + p.workerCount, 0);
            const isToday = iso === todayISO;
            return (
              <YStack
                key={iso}
                borderRadius="$card"
                borderWidth={1}
                borderColor={isToday ? '$accent600' : '$neutral200'}
                backgroundColor="$neutral0"
                padding="$3"
                gap="$2"
                onPress={() => router.push(`/(contractor)/dispatch?date=${iso}`)}
                accessibilityRole="button"
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <XStack alignItems="center" gap="$2">
                    <Text
                      fontSize={15}
                      fontWeight="600"
                      color={isToday ? '$accent600' : '$neutral900'}
                    >
                      {weekday} {day} {month}
                    </Text>
                    {isToday && (
                      <Text fontSize={11} color="$accent600" fontWeight="600">
                        Aujourd&apos;hui
                      </Text>
                    )}
                  </XStack>
                  <Text fontSize={13} color="$neutral500">
                    {totalWorkers > 0
                      ? `${totalWorkers} ouvrier${totalWorkers > 1 ? 's' : ''}`
                      : 'Aucune affectation'}
                  </Text>
                </XStack>

                {projectSummaries.length > 0 && (
                  <YStack gap="$1">
                    {projectSummaries.map((p) => (
                      <XStack key={p.projectId} justifyContent="space-between">
                        <Text fontSize={13.5} color="$neutral700" numberOfLines={1} flex={1}>
                          {p.projectName}
                        </Text>
                        <Text fontSize={13.5} color="$neutral500">
                          {p.workerCount} ouvrier{p.workerCount > 1 ? 's' : ''}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                )}
              </YStack>
            );
          })}

          {Object.keys(summaryByDay).length === 0 && (
            <EmptyState
              icon={CalendarBlankIcon}
              illustration="route-planning"
              title="Aucune affectation cette semaine"
              description="Planifiez des affectations depuis le tableau de dispatch."
            />
          )}
        </ScrollView>
      )}
    </YStack>
  );
}

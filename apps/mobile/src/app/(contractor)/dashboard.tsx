import { color } from '@dala/design-tokens';
import type { AttendanceStatus, OrgActivityEvent, Project, Worker } from '@dala/shared-types';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CoinsIcon,
  HandCoinsIcon,
  HandWavingIcon,
  NoteIcon,
  ShieldWarningIcon,
} from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack, Image, View } from 'tamagui';

import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';
import { OrgSwitcherSheet } from '@/components/shell/OrgSwitcherSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Carousel } from '@/components/ui/Carousel';
import { ErrorState } from '@/components/ui/ErrorState';
import { NumericText } from '@/components/ui/NumericText';
import { ProgressBar } from '@/components/ui/Progress';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { runSync } from '@/db/sync';
import { getActiveOrgId, setActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { listMyOrganizations, listOwnedOrganizations, type MyOrgSummary } from '@/lib/myOrgs';
import { getProjectTypeMeta } from '@/lib/projectTypeMeta';
import { cycleEndISO, cycleStartISO, todayISO } from '@/lib/salaryCycle';
import { getSignedUrlMap } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { toRgba, useTokenColor } from '@/lib/useTokenColor';

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
 * IMPROVEMENT-PLAN PHASE 8 (§1.7) — the activity feed named as "still cut"
 * by every prior phase (Phase 23 through Phase 7) is now built. `audit_log`
 * (migration 0009) was confirmed, by grepping every apps/admin
 * logAdminAction() call site, to be EXCLUSIVELY platform-admin actions
 * (feature_flag.*, admin.impersonate_*, billing.*, etc) — never anything
 * an org's own contractor did. RLS-ing it open would have surfaced either
 * an empty feed or the wrong one. The feed below instead reads the new
 * `org_activity_feed` table (migration 0073), populated by AFTER INSERT
 * triggers on site_logs/project_expenses/safety_incidents/
 * dispatch_assignments — see that migration's own Part 1 header for the
 * full reasoning and why this exact four-event starter set was chosen.
 * No backfill: an org with real history before this migration shipped
 * will show an empty/short feed until new activity happens, by design.
 *
 * STILL CUT, same reason as every prior phase — re-verified, not silently
 * dropped:
 *   - Unverified-email banner: still a real §3.9 element, still out of
 *     scope for this pass.
 *
 * CORRECTION (org-creation-guide follow-on) — this comment previously also
 * listed "profile-completion checklist" as still cut. That's no longer
 * true and hadn't been since Phase 12: `OnboardingChecklist` (imported
 * above, rendered below) IS that checklist — first-run nudge toward a
 * first project/worker/pointage, dismissible via `onboarding_dismissed_at`.
 * The org-creation-guide's later wizard work added a second, separate
 * profile-COMPLETION nudge (org fields, not first actions) triggered from
 * `login.tsx`, and a one-mount `from_wizard` param this screen reads to
 * suppress `OnboardingChecklist`'s render just once right after exiting
 * that wizard, so a brand-new org isn't nudged by both in the same
 * breath — see this screen's own `suppressOnboardingChecklist` and Doc 03
 * §3.9's edge cases for the full reasoning.
 *
 * UI/UX pass (post-Phase-27 audit): added pull-to-refresh on the main
 * ScrollView (was missing on every list screen in the app) and upgraded
 * the "Chantiers actifs" row from a plain horizontal ScrollView to the new
 * `Carousel` component — see that section's own comment below.
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
  photoPath: string | null;
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

// Phase 8 §1.7 — one icon per feed event type, module-level like STATUS_DOT
// above rather than recreated per render.
const ACTIVITY_ICON: Record<OrgActivityEvent['event_type'], typeof NoteIcon> = {
  site_log_added: NoteIcon,
  expense_recorded: CoinsIcon,
  safety_incident_reported: ShieldWarningIcon,
  dispatch_assigned: CalendarBlankIcon,
};

// Round 2 audit (§1.4) — every activity row previously shared the same flat
// `$accent50`/accent600 tint regardless of what actually happened (a
// journal entry, an expense, an incident, a dispatch assignment), which
// was the exact "one accent color for everything" finding the first audit
// already flagged elsewhere. Keys here are `useTokenColor()` property
// names, resolved at render time (module scope can't call the hook) so
// each event type reads its own theme-aware color.
const ACTIVITY_TINT: Record<
  OrgActivityEvent['event_type'],
  keyof ReturnType<typeof useTokenColor>
> = {
  site_log_added: 'categoricalBlue',
  expense_recorded: 'categoricalAmber',
  safety_incident_reported: 'danger',
  dispatch_assigned: 'categoricalViolet',
};

export default function DashboardScreen() {
  const tc = useTokenColor();

  // Org-creation-guide addition — create-organization.tsx's wizard routes
  // here with `?from_wizard=1` on every exit (finish, skip, or "Terminer
  // plus tard"). A brand-new org fails BOTH this screen's own
  // OnboardingChecklist conditions (no project/worker/pointage yet) AND
  // the wizard's own completion check at the same time, so without this,
  // someone could get nudged by the wizard right after signing up and
  // then immediately nudged again by this card the moment they land here.
  // Captured once via lazy useState init (not re-read from params on every
  // render) so it suppresses for exactly this one mounted instance of the
  // screen — the very next time this screen is freshly mounted (app
  // relaunch, a new login) the param is gone and the checklist behaves
  // exactly as it always has. Nothing is ever permanently dismissed by
  // this — org.checklist's own "X" dismiss button is the only thing that
  // does that, unchanged.
  const params = useLocalSearchParams<{ from_wizard?: string }>();
  const [suppressOnboardingChecklist] = useState(() => params.from_wizard === '1');

  const [orgs, setOrgs] = useState<MyOrgSummary[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Phase 20 (§1.7a) — Dashboard composes independent sources (dispatch-
  // today, active-projects, payroll-summary, activity-feed), each its own
  // loader, so per §1.7a's own worked example this needs section-level
  // ErrorState, not one full-page one that would hide sections whose
  // fetch actually succeeded. `loadGreetingName` deliberately left
  // ungated — its failure just skips the personalized "Bonjour, X" and
  // falls back to a generic greeting, a cosmetic degrade, not a broken
  // section.
  const [dispatchError, setDispatchError] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [payrollError, setPayrollError] = useState(false);
  const [activityError, setActivityError] = useState(false);

  const [netThisWeek, setNetThisWeek] = useState(0);
  const [payrollDeltaPercent, setPayrollDeltaPercent] = useState<number | null>(null);
  const [payrollSparkline, setPayrollSparkline] = useState<number[]>([]);

  const [dispatchToday, setDispatchToday] = useState<DispatchTodayWorker[]>([]);
  const [dispatchPhotoUrlByPath, setDispatchPhotoUrlByPath] = useState<Record<string, string>>({});
  const [projectPhotoUrlByPath, setProjectPhotoUrlByPath] = useState<Record<string, string>>({});
  // Bug fix (found while building the collaboration-screen org-identity
  // work): logo_url is a private-bucket storage PATH, not a fetchable
  // URL — every other photo on this screen (dispatchPhotoUrlByPath,
  // projectPhotoUrlByPath below) is already resolved through
  // getSignedUrlMap before being handed to an <Avatar>/<Image>; this one
  // was never signed at all, so every org's logo in the switcher (and the
  // header avatar below) was rendering broken/blank regardless of whose
  // org it was — not a permissions issue, just a missing signing step.
  const [orgLogoUrlByPath, setOrgLogoUrlByPath] = useState<Record<string, string>>({});
  const [activeProjects, setActiveProjects] = useState<ActiveProjectSummary[]>([]);

  // Phase 8 §1.7 — activity feed. actorNameById/workerNameById resolve the
  // feed's raw ids into display names, same batched-lookup shape every
  // other section on this screen already uses (projectPhotoUrlByPath etc).
  const [activityFeed, setActivityFeed] = useState<OrgActivityEvent[]>([]);
  const [actorNameById, setActorNameById] = useState<Record<string, string>>({});
  const [feedProjectNameById, setFeedProjectNameById] = useState<Record<string, string>>({});
  const [feedWorkerNameById, setFeedWorkerNameById] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setDispatchError(false);
    setProjectsError(false);
    setPayrollError(false);
    setActivityError(false);
    const [all, owned, active] = await Promise.all([
      listMyOrganizations(),
      listOwnedOrganizations(),
      getActiveOrgId(),
    ]);
    setOrgs(all);
    setOwnedCount(owned.length);
    setActiveOrgIdState(active);
    void getSignedUrlMap(all.map((o) => o.logo_url ?? null)).then(setOrgLogoUrlByPath);

    await Promise.all([
      loadGreetingName(),
      loadDispatchToday(active),
      loadActiveProjects(active),
      loadPayrollSummary(active),
      loadActivityFeed(active),
    ]);
    setLoading(false);
    setRefreshing(false);
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
    const [
      { data: assignments, error: assignmentsError },
      { data: attendance, error: attendanceError },
    ] = await Promise.all([
      supabase
        .from('dispatch_assignments')
        .select('worker_id, actual_departure_time, workers(full_name, photo_url)')
        .eq('org_id', org)
        .eq('assignment_date', today),
      supabase
        .from('attendance_effective')
        .select('worker_id')
        .eq('org_id', org)
        .eq('record_date', today),
    ]);
    if (assignmentsError || attendanceError) {
      setDispatchError(true);
      return;
    }

    // Bug fix: dispatch_assignments has no unique constraint on
    // (worker_id, assignment_date) — a worker can legitimately have more
    // than one assignment the same day (e.g. two different projects/
    // vehicles). This card strip shows one avatar per *worker*, not per
    // assignment, so multiple rows for the same worker must be folded
    // into a single card here — otherwise React sees duplicate
    // `worker.workerId` keys and the same worker renders twice. When a
    // worker has more than one row, keep whichever status is furthest
    // along (arrived beats en route beats not-yet-departed), since
    // that's the most useful single status to surface for that worker.
    const STATUS_RANK: Record<DispatchTodayWorker['status'], number> = {
      sur_place: 2,
      en_route: 1,
      a_venir: 0,
    };
    const arrivedIds = new Set((attendance ?? []).map((a) => a.worker_id));
    const byWorker = new Map<string, DispatchTodayWorker>();
    for (const a of (assignments ?? []) as any[]) {
      const status: DispatchTodayWorker['status'] = arrivedIds.has(a.worker_id)
        ? 'sur_place'
        : a.actual_departure_time
          ? 'en_route'
          : 'a_venir';
      const existing = byWorker.get(a.worker_id);
      if (!existing || STATUS_RANK[status] > STATUS_RANK[existing.status]) {
        byWorker.set(a.worker_id, {
          workerId: a.worker_id,
          name: a.workers?.full_name ?? 'Ouvrier',
          photoPath: a.workers?.photo_url ?? null,
          status,
        });
      }
    }
    const workers = Array.from(byWorker.values());
    setDispatchToday(workers);
    // Phase 3 §1.5 — same simplification disclosed in dispatch.tsx/
    // pointage.tsx: workers.photo_url directly, not the profiles.avatar_url
    // priority chain (see docs/PHASE_3_BRIEF.md).
    void getSignedUrlMap(workers.map((w) => w.photoPath)).then(setDispatchPhotoUrlByPath);
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
    const { data: projects, error: projectsErr } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3);
    if (projectsErr) {
      setProjectsError(true);
      return;
    }

    const projectIds = (projects ?? []).map((p) => p.id);
    let consumedById: Record<string, number> = {};
    if (projectIds.length > 0) {
      const { data: expenseRows, error: expensesErr } = await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', projectIds);
      if (expensesErr) {
        setProjectsError(true);
        return;
      }
      consumedById = (expenseRows ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.amount);
        return acc;
      }, {});
    }

    setActiveProjects(
      (projects ?? []).map((p) => ({ ...(p as Project), consumedTotal: consumedById[p.id] ?? 0 })),
    );
    // Phase 3 §1.5 — project cards' cover image, same batched pattern.
    void getSignedUrlMap((projects ?? []).map((p: any) => p.cover_photo_url ?? null)).then(
      setProjectPhotoUrlByPath,
    );
  }

  /** Phase 8 §1.7 — dashboard "Activité récente" card. Latest 8 events
   * org-wide (bounded — this is a dashboard summary, not the full history;
   * no "Voir tout" screen exists for this yet, not in this phase's scope).
   * Resolves display names in three small batched lookups rather than a
   * PostgREST embed through org_activity_feed's own FKs — `actor_id` can
   * be null (dispatch events) and the worker name for a dispatch event
   * lives in `metadata->worker_id`, not a column this table has an FK
   * for, so a single embedded select can't cover all four event types
   * uniformly anyway. */
  async function loadActivityFeed(org: string | null) {
    if (!org) {
      setActivityFeed([]);
      setActorNameById({});
      setFeedProjectNameById({});
      setFeedWorkerNameById({});
      return;
    }
    const { data: events, error: eventsError } = await supabase
      .from('org_activity_feed')
      .select('*')
      .eq('org_id', org)
      .order('created_at', { ascending: false })
      .limit(8);
    if (eventsError) {
      setActivityError(true);
      return;
    }
    const feed = (events as OrgActivityEvent[] | null) ?? [];
    setActivityFeed(feed);

    const actorIds = Array.from(new Set(feed.map((e) => e.actor_id).filter(Boolean))) as string[];
    const projectIds = Array.from(
      new Set(feed.map((e) => e.project_id).filter(Boolean)),
    ) as string[];
    const workerIds = Array.from(
      new Set(
        feed
          .filter((e) => e.event_type === 'dispatch_assigned')
          .map((e) => e.metadata?.worker_id as string | undefined)
          .filter(Boolean),
      ),
    ) as string[];

    // Audit fix 1c — profiles_select_own (0005) is `id = auth.uid()` only,
    // so a direct `.from('profiles')` query here silently returned zero
    // rows for any actor but the caller (masked by "Quelqu'un" below).
    // get_org_member_profiles (0085) closes that gap.
    const [{ data: actorRows }, { data: projectRows }, { data: workerRows }] = await Promise.all([
      actorIds.length > 0
        ? supabase.rpc('get_org_member_profiles', { p_org_id: org }).then(({ data }) => ({
            data: (data ?? []).filter((p: any) => actorIds.includes(p.id)),
          }))
        : Promise.resolve({ data: [] }),
      projectIds.length > 0
        ? supabase.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [] }),
      workerIds.length > 0
        ? supabase.from('workers').select('id, full_name').in('id', workerIds)
        : Promise.resolve({ data: [] }),
    ]);

    setActorNameById(
      ((actorRows as { id: string; full_name: string }[] | null) ?? []).reduce<
        Record<string, string>
      >((acc, r) => ({ ...acc, [r.id]: r.full_name }), {}),
    );
    setFeedProjectNameById(
      ((projectRows as { id: string; name: string }[] | null) ?? []).reduce<Record<string, string>>(
        (acc, r) => ({ ...acc, [r.id]: r.name }),
        {},
      ),
    );
    setFeedWorkerNameById(
      ((workerRows as { id: string; full_name: string }[] | null) ?? []).reduce<
        Record<string, string>
      >((acc, r) => ({ ...acc, [r.id]: r.full_name }), {}),
    );
  }

  /** Phase 8 §1.7 — one human-readable line per feed event. Kept as a plain
   * function (not a component) since it only ever produces text, same
   * reasoning requestingWorkerName()-style helpers use elsewhere in this
   * app. */
  function activityEventLabel(event: OrgActivityEvent): string {
    const actor = event.actor_id ? (actorNameById[event.actor_id] ?? 'Quelqu’un') : 'L’équipe';
    const project = event.project_id ? feedProjectNameById[event.project_id] : null;
    switch (event.event_type) {
      case 'site_log_added':
        return `${actor} a ajouté une entrée au journal${project ? ` · ${project}` : ''}`;
      case 'expense_recorded': {
        const amount = event.metadata?.amount;
        return `${actor} a enregistré une dépense${amount != null ? ` de ${amount} TND` : ''}${project ? ` · ${project}` : ''}`;
      }
      case 'safety_incident_reported': {
        const severity = event.metadata?.severity as string | undefined;
        const severityLabel =
          severity === 'severe' ? 'grave' : severity === 'moderate' ? 'modéré' : 'mineur';
        return `${actor} a signalé un incident (${severityLabel})${project ? ` · ${project}` : ''}`;
      }
      case 'dispatch_assigned': {
        const workerId = event.metadata?.worker_id as string | undefined;
        const workerName = workerId
          ? (feedWorkerNameById[workerId] ?? 'Un travailleur')
          : 'Un travailleur';
        return `${workerName} dispatché${project ? ` · ${project}` : ''}`;
      }
      default:
        return 'Activité';
    }
  }

  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'À l’instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH} h`;
    const diffD = Math.floor(diffH / 24);
    return `Il y a ${diffD} j`;
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

    const [
      { data: workers, error: workersErr },
      { data: attendance, error: attendanceErr },
      { data: advancesThisWeek, error: advancesErr },
      { data: cycles, error: cyclesErr },
    ] = await Promise.all([
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
    if (workersErr || attendanceErr || advancesErr || cyclesErr) {
      setPayrollError(true);
      return;
    }

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
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <YStack gap="$3">
          {loading ? (
            <SkeletonBlock width="60%" height={23} />
          ) : (
            <XStack alignItems="center" gap="$2">
              <Text fontFamily="$display" fontSize={23} fontWeight="600">
                {firstName ? `Bonjour, ${firstName}` : 'Bonjour'}
              </Text>
              <HandWavingIcon size={20} weight="fill" color={tc.accent600} />
            </XStack>
          )}

          {/* Round 2 audit (§1.9) — was conditionally hidden for
              single-org accounts ("nothing to switch to"), but that also
              meant a single-org user had zero on-screen confirmation of
              which org they're in, and no path to add a second one. Now
              always rendered; the sheet itself (OrgSwitcherSheet.tsx)
              adapts its content to whether there's more than one org. */}
          {activeOrg && (
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
              <Avatar
                name={activeOrg.name}
                imageUrl={activeOrg.logo_url ? orgLogoUrlByPath[activeOrg.logo_url] : undefined}
                size={20}
              />
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
          logoUrlByPath={orgLogoUrlByPath}
        />

        {/* Phase 12 (improvement-plan §10.7) — first-run guided
            walkthrough. Renders nothing once every step is done or the
            org has dismissed it — see its own header. Also skipped on
            this one mount when arriving fresh from create-organization.tsx
            (see suppressOnboardingChecklist above) so a brand-new org
            isn't nudged by two different first-run cards back to back. */}
        {!suppressOnboardingChecklist && <OnboardingChecklist orgId={activeOrgId} />}

        {/* Phase 27 — hero StatCard, the block Doc 05 §2.2 specs first and
            Phase 23 explicitly cut. */}
        {payrollError && !loading ? (
          <YStack backgroundColor="$neutral0" borderRadius="$card">
            <ErrorState onRetry={() => void loadPayrollSummary(activeOrgId)} />
          </YStack>
        ) : (
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
        )}

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
            <Button
              variant="chip"
              fullWidth={false}
              onPress={() => router.push('/dispatch')}
              accessibilityLabel="Voir le dispatch du jour"
            >
              Voir tout
            </Button>
          </XStack>

          {loading ? (
            <XStack gap="$2">
              <SkeletonBlock width={96} height={84} radius={16} />
              <SkeletonBlock width={96} height={84} radius={16} />
              <SkeletonBlock width={96} height={84} radius={16} />
            </XStack>
          ) : dispatchError ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card">
              <ErrorState onRetry={() => void loadDispatchToday(activeOrgId)} />
            </YStack>
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
                      <Avatar
                        name={worker.name}
                        imageUrl={
                          worker.photoPath ? dispatchPhotoUrlByPath[worker.photoPath] : undefined
                        }
                        size={36}
                      />
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

        {/* Active projects — a horizontal carousel with the app's first
            on-screen progress bar, reusing projects.tsx's own
            budget-consumed calculation. UI/UX pass: upgraded from a plain
            <ScrollView horizontal> to the new `Carousel` component, which
            adds page-snap + a dot indicator — with more than 2-3 active
            chantiers there was previously no sense of "how many more are
            there" while scrolling. */}
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
            <Button
              variant="chip"
              fullWidth={false}
              onPress={() => router.push('/portfolio')}
              accessibilityLabel="Voir tous les chantiers"
            >
              Voir tout
            </Button>
          </XStack>

          {loading ? (
            <XStack gap="$2.5">
              <SkeletonBlock width={220} height={110} radius={16} />
              <SkeletonBlock width={220} height={110} radius={16} />
            </XStack>
          ) : projectsError ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card">
              <ErrorState onRetry={() => void loadActiveProjects(activeOrgId)} />
            </YStack>
          ) : activeProjects.length === 0 ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4">
              <Text fontSize={13.5} color="$neutral500">
                Aucun chantier actif pour le moment.
              </Text>
            </YStack>
          ) : (
            <Carousel
              data={activeProjects}
              keyExtractor={(project) => project.id}
              itemWidth={220}
              contentPaddingHorizontal={0}
              renderItem={(project) => {
                const consumedPercent =
                  project.budget_total && project.budget_total > 0
                    ? Math.min(
                        100,
                        Math.round((project.consumedTotal / project.budget_total) * 100),
                      )
                    : null;
                const typeMeta = getProjectTypeMeta(project.project_type);
                const TypeIcon = typeMeta.icon;
                const typeTint = tc[typeMeta.colorKey];
                return (
                  <YStack
                    backgroundColor="$neutral0"
                    borderRadius="$card"
                    padding="$4"
                    gap="$2"
                    onPress={() => router.push(`/project/${project.id}` as never)}
                    accessibilityRole="button"
                    accessibilityLabel={project.name}
                  >
                    {project.cover_photo_url && projectPhotoUrlByPath[project.cover_photo_url] ? (
                      <Image
                        src={projectPhotoUrlByPath[project.cover_photo_url]}
                        width="100%"
                        height={90}
                        borderRadius={10}
                        marginBottom="$1"
                      />
                    ) : (
                      <View
                        width={36}
                        height={36}
                        borderRadius={10}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor={toRgba(typeTint, 0.14)}
                      >
                        <TypeIcon size={18} weight="fill" color={typeTint} />
                      </View>
                    )}
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
              }}
            />
          )}
        </YStack>

        {/* Quick actions — restyled from two stacked full-width rows into
            a 2-column grid. Still exactly the two destinations Phase 23
            shipped, no complexity creep.

            JUDGMENT CALL (Phase 19D, phase-18 proposal §24): the pastel-
            icon-circle pattern is restricted to "genuinely small (2-4),
            equal-weight shortcut sets... must never be the sole content
            of a page section without a real data element alongside it."
            This satisfies the first half exactly (2 destinations, equal
            weight) — but has no real data element (no count, no figure),
            and on a strict reading of the second half, that's a genuine
            violation, not a pass. Considered adding a live count badge
            to each tile (e.g. active chantiers, pending avances) instead
            of resizing — rejected: the only chantiers count already
            fetched on this screen (`activeProjects`) is capped at 3 for
            the carousel above, so its length would silently under-report
            once an org has more than 3 active projects (worse than no
            data element at all); a pending-avances count needs a new
            query this item's scope doesn't cover. Given the audit's own
            stated complaint was specifically "quite large relative to
            how little information they convey" — a size/information
            imbalance — addressed here from the size side instead:
            shrunk from a large vertical icon-over-label tile toward a
            compact horizontal icon+label row, closer to a dense nav
            shortcut than an app-icon-grid tile, so its visual weight
            now roughly matches what it actually conveys. */}
        <XStack gap="$2.5">
          <XStack
            flex={1}
            backgroundColor="$neutral0"
            borderRadius="$card"
            paddingVertical="$2.5"
            paddingHorizontal="$3"
            gap="$2"
            alignItems="center"
            onPress={() => router.push('/portfolio')}
            accessibilityRole="button"
            accessibilityLabel="Voir tous les chantiers"
          >
            <YStack
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor={toRgba(tc.categoricalBlue, 0.14)}
              alignItems="center"
              justifyContent="center"
            >
              <BuildingsIcon size={15} weight="bold" color={tc.categoricalBlue} />
            </YStack>
            <Text fontSize={13.5} fontWeight="600">
              Chantiers
            </Text>
          </XStack>

          <XStack
            flex={1}
            backgroundColor="$neutral0"
            borderRadius="$card"
            paddingVertical="$2.5"
            paddingHorizontal="$3"
            gap="$2"
            alignItems="center"
            onPress={() => router.push('/advances')}
            accessibilityRole="button"
            accessibilityLabel="Voir les avances"
          >
            <YStack
              width={28}
              height={28}
              borderRadius={14}
              backgroundColor={toRgba(tc.success, 0.14)}
              alignItems="center"
              justifyContent="center"
            >
              <HandCoinsIcon size={15} weight="bold" color={tc.success} />
            </YStack>
            <Text fontSize={13.5} fontWeight="600">
              Avances
            </Text>
          </XStack>
        </XStack>

        {/* Phase 8 §1.7 — activity feed, previously "still deliberately
            not built" (see file header for the backend gap that blocked
            it and how migration 0073 closes it). */}
        <YStack gap="$2.5">
          <Text
            fontSize={13}
            fontWeight="600"
            color="$neutral500"
            textTransform="uppercase"
            letterSpacing={0.4}
          >
            Activité récente
          </Text>
          {loading ? (
            <YStack gap="$2">
              <SkeletonBlock width="100%" height={44} radius={12} />
              <SkeletonBlock width="100%" height={44} radius={12} />
            </YStack>
          ) : activityError ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card">
              <ErrorState onRetry={() => void loadActivityFeed(activeOrgId)} />
            </YStack>
          ) : activityFeed.length === 0 ? (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4">
              <Text fontSize={13.5} color="$neutral500">
                Aucune activité récente. Les nouvelles entrées de journal, dépenses, incidents et
                dispatchs apparaîtront ici.
              </Text>
            </YStack>
          ) : (
            <YStack backgroundColor="$neutral0" borderRadius="$card" overflow="hidden">
              {activityFeed.map((event, i) => {
                const Icon = ACTIVITY_ICON[event.event_type];
                const tint = tc[ACTIVITY_TINT[event.event_type]];
                return (
                  <XStack
                    key={event.id}
                    alignItems="center"
                    gap="$3"
                    paddingHorizontal="$4"
                    paddingVertical={12}
                    borderTopWidth={i === 0 ? 0 : 1}
                    borderTopColor="$neutral100"
                  >
                    <YStack
                      width={32}
                      height={32}
                      borderRadius={16}
                      backgroundColor={toRgba(tint, 0.14)}
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Icon size={16} weight="bold" color={tint} />
                    </YStack>
                    <YStack flex={1} gap={2}>
                      <Text fontSize={13.5} numberOfLines={2}>
                        {activityEventLabel(event)}
                      </Text>
                      <Text fontSize={11.5} color="$neutral500">
                        {relativeTime(event.created_at)}
                      </Text>
                    </YStack>
                  </XStack>
                );
              })}
            </YStack>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

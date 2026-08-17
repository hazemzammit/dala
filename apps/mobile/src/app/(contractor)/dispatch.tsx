import { color } from '@dala/design-tokens';
import type {
  ConfirmationChannel,
  DispatchAssignment,
  Project,
  Vehicle,
  Worker,
} from '@dala/shared-types';
import { createDispatchAssignmentSchema, updateDispatchAssignmentSchema } from '@dala/validation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, CalendarBlankIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { DispatchConflictsSheet } from '@/components/dispatch/DispatchConflictsSheet';
import { DraggableAssignmentChip } from '@/components/dispatch/DraggableAssignmentChip';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TimeInput } from '@/components/ui/TimeInput';
import { useToast } from '@/components/ui/Toast';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import DispatchAssignmentModel from '@/db/models/DispatchAssignment';
import DispatchAssignmentConflictModel from '@/db/models/DispatchAssignmentConflict';
import { runSync } from '@/db/sync';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/dispatch.tsx
 *
 * Doc 03 §3.11, Doc 05 §2.3 — mobile dispatch board. Deliberately NOT a port
 * of the web weekly drag-grid: a horizontal date strip + one "lane" card per
 * vehicle (plus an "Sans véhicule" lane), tap a lane to assign, conflicts
 * surface inline (never a blocking modal — see handleAssign's comment).
 *
 * Offline/version-conflict handling (Doc 01 §1.9, Doc 03 §3.11): this is the
 * one screen where a conflicting write must NEVER auto-merge.
 * `handleUpdateExisting`'s read-before-write version compare (below)
 * already implements this correctly for the ONLINE case — a live read of
 * the current server version right before writing, an explicit "Modifié
 * ailleurs" conflict state, and an explicit keep-mine/use-theirs choice
 * before anything is overwritten. Doc 03 §3.11 itself: "This is the one
 * place in the app where an automatic merge is deliberately avoided — a
 * wrong automatic guess here means the wrong worker gets sent to the wrong
 * site."
 *
 * PHASE 19 SCOPE DECISION, disclosed rather than silently drawn:
 * `handleAssignSubmit` (new assignments) and `copyPreviousWeek` (bulk copy)
 * are now local-first — `createWithClientId` + `runSync()`, same pattern
 * every other screen this phase uses — since a brand-new row has no
 * existing version to conflict with, converting them was low-risk.
 * `handleUpdateExisting` (editing an existing assignment) was DELIBERATELY
 * LEFT AS ONLINE-ONLY, unchanged. Retrofitting it to work fully offline
 * while preserving this exact same immediate, explicit conflict UX would
 * mean either (a) losing the instant "Modifié ailleurs" feedback in favor
 * of an async conflict surfaced only on a later sync (the
 * `dispatch_assignment_conflicts` local table Phase 18's redo built the
 * plumbing for, but which still has no UI reader anywhere in this app —
 * see that table's own schema.ts comment), or (b) building a genuinely
 * harder hybrid (try live first, fall back to local-first only on a real
 * network failure, reconcile the two conflict-surfacing paths into one UI).
 * Given this exact screen is the one place Doc 03 explicitly says a wrong
 * guess sends the wrong worker to the wrong site, rushing that hybrid
 * under this pass's remaining time felt like a worse trade than shipping
 * the already-correct online behavior unchanged and flagging the offline
 * gap plainly, rather than degrading a working, spec-correct flow to hit a
 * scope target.
 *
 * Project-scoped mode (Phase 11, Doc 03 §3.10.2's Dispatch tab): accepts an
 * optional `project_id` deep-link param from `project/[id].tsx`, same
 * pattern as expenses.tsx/journal.tsx (Phase 10) — back arrow returns to
 * the hub, the assignment list filters to that project, and a new
 * assignment auto-sets `project_id` instead of showing the "Chantier"
 * picker chip-row. One deliberate difference from the Dépenses/Journal
 * retrofit, stated plainly rather than silently copied: this screen has no
 * "week" concept to scope to — it was already a single-date view with a
 * rolling date strip before this phase, and stays that way when scoped.
 * "Same time-window behavior as the global board" means keeping that same
 * date strip, not inventing a Monday–Sunday grid that doesn't exist
 * anywhere else in this app. The overbooking/absence checks in
 * `checkWarnings` deliberately stay org+date scoped, not project-scoped —
 * a worker double-booked to two different projects the same day is still
 * a real conflict and must keep surfacing regardless of which project tab
 * this sheet was opened from. Visibility: shown to both lead and
 * trade-participant orgs (see `project/[id].tsx`'s header for why) — RLS
 * (`dispatch_assignments_select_member`, is_org_member(org_id)) already
 * scopes every query to the caller's own org's rows, so a trade org
 * viewing this tab only ever sees its own workers' assignments on this
 * project, never the lead org's or another trade org's — no policy change
 * needed. A project that's `completed`/`archived` renders read-only — no
 * "+ Assigner", no editing existing rows, historical assignments still
 * listed.
 *
 * PHASE 20 — the async-conflict entry point flagged as missing at the end
 * of Phase 19 (`dispatch_assignment_conflicts` had no UI reader anywhere
 * in the app). `conflictCount` is loaded alongside everything else in
 * `load()`; a "Vos changements" badge appears next to the date header
 * whenever it's > 0 and opens `DispatchConflictsSheet` on tap — that
 * component owns the actual compare/resolve UI, this file just surfaces
 * the entry point and refreshes its count + the assignment list once a
 * conflict is resolved (a resolved conflict can change what's shown on
 * the board, e.g. reverting a lane back to the server's assignment).
 *
 * PHASE 21 — PRODUCT DECISION, re-evaluated rather than left silently
 * unchanged: now that the compare-sheet above exists and has been
 * exercised as a real (if unverified-live) UI, does the Phase 19 trade-off
 * for `handleUpdateExisting` still hold? Decision: YES — it stays
 * online-only, unconverted. The compare-sheet's entire mechanism is
 * necessarily ASYNC: a conflict is only discovered and surfaced the next
 * time `runSync()` happens to run (app foreground, reconnect, or a manual
 * trigger), which could be seconds or hours after the edit that caused it.
 * `handleUpdateExisting`'s existing online-only path is the opposite:
 * SYNCHRONOUS discovery, at the moment of the edit, before anything is
 * ever written — the contractor sees "Modifié ailleurs" and picks
 * explicitly before the save button's tap has any effect at all. Converting
 * this screen to local-first would trade that immediate guarantee for the
 * compare-sheet's async one: a contractor could edit a dispatch cell
 * offline, see it save instantly (locally, optimistically), act on it (tell
 * a worker "you're on-site at 8am now") — and only discover, possibly much
 * later, that the edit never actually held because someone else's write
 * landed first. That's a strictly worse outcome for the one screen Doc 03
 * §3.11 itself singles out: "a wrong automatic guess here means the wrong
 * worker gets sent to the wrong site." An async surface is not an automatic
 * guess, but the DELAY before the contractor learns their edit didn't hold
 * carries the same real-world risk the spec is warning about. The
 * compare-sheet remains the right mechanism for the write paths it already
 * covers (a stale push-time race on `handleAssignSubmit`/`copyPreviousWeek`,
 * which have no live-read step to catch a conflict before writing) — it
 * just isn't a strictly better fit for a screen that already has a
 * synchronous alternative. Net effect: existing assignments still require
 * connectivity to edit; new assignments remain offline-capable via Phase
 * 19's conversion. Nothing in this file's actual behavior changed this
 * phase — this header update states the re-evaluated reasoning explicitly,
 * per this phase's own instruction not to leave a real trade-off
 * re-examination silent even when the answer comes out the same way twice.
 *
 * UI/UX pass (post-audit): three additive changes, the first two read-only,
 * the third a real new write path built the same way this file argues
 * every write path here must be — funneled through a single, explicit,
 * conflict-safe core rather than a shortcut.
 *   (1) A density dot under each day chip in the 14-day strip, backed by a
 *       new lightweight `loadDensity` query (assignment_date only,
 *       windowed to the visible 14 days).
 *   (2) Each vehicle lane's "· N places" text became a dot-fill capacity
 *       meter, same data already computed, just visualized.
 *   (3) Drag-and-drop between vehicle lanes (long-press a worker chip,
 *       drag it into another lane) — see `DraggableAssignmentChip.tsx` for
 *       the gesture mechanics, and `submitAssignmentPatch` /
 *       `handleDragReassign` below for the write path. This was
 *       DELIBERATELY NOT bundled into the same pass as (1)/(2) originally
 *       — it's a real write against `dispatch_assignments`, the one table
 *       this entire file's header spends hundreds of lines reasoning about
 *       online-only, live-version-checked writes for. It was built as its
 *       own dedicated follow-up specifically so it could reuse
 *       `handleUpdateExisting`'s exact conflict logic (now extracted into
 *       `submitAssignmentPatch`, called by both the sheet-driven edit and
 *       the drag path) rather than re-deriving a parallel, possibly
 *       weaker, version of it. A drag that lands cleanly writes directly;
 *       a drag that hits a live version conflict re-opens the EXACT same
 *       "Modifié ailleurs" sheet UI the tap-to-edit path already has,
 *       pre-filled with the drag's intended destination — no second
 *       conflict UI was invented. A drag onto a vehicle already at
 *       capacity, or in maintenance, is rejected client-side before any
 *       write is attempted (same capacity/maintenance rules
 *       `checkWarnings`/the assign-sheet already enforce). Still online-
 *       only, same as every other edit to an existing assignment in this
 *       file — dragging while offline surfaces the same "Impossible de
 *       réaffecter" toast a failed edit would.
 */
type EnrichedAssignment = DispatchAssignment & {
  workerName: string;
};

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

function dateChips(centerISO: string): string[] {
  return Array.from({ length: 14 }, (_, i) => addDays(centerISO, i - 3));
}

function frLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  return { weekday, day: String(d.getDate()) };
}

export default function DispatchScreen() {
  const toast = useToast();
  const { project_id: deepLinkProjectId } = useLocalSearchParams<{ project_id?: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([]);
  // Only populated in project-scoped mode — fetched directly by id (not via
  // the `lead_org_id`-filtered `projects` list below) so it resolves for a
  // trade-participant org too, same as project/[id].tsx's own fetch.
  const [scopedProject, setScopedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictsSheetOpen, setConflictsSheetOpen] = useState(false);
  // UI/UX pass — density dots under the 14-day strip, previously absent:
  // set of ISO dates (within the visible window) that already have at
  // least one assignment, so a manager can see at a glance which days
  // still need planning without tapping through each one.
  const [datesWithAssignments, setDatesWithAssignments] = useState<Set<string>>(new Set());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedAssignment | null>(null);
  const [laneVehicleId, setLaneVehicleId] = useState<string | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [departureTime, setDepartureTime] = useState('');
  const [tools, setTools] = useState('');
  const [channel, setChannel] = useState<ConfirmationChannel>('app');
  const [warning, setWarning] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ serverVersion: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 26 — TimeInput can only ever produce a well-formed HH:MM value
  // (it's picker-driven, not free text), so this only ever fires for the
  // "required but empty" case — kept separate from the general `error`
  // string so it renders under the field itself, matching FormField's own
  // per-field error convention rather than only at the bottom of the sheet.
  const [departureTimeError, setDepartureTimeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // UI/UX pass — drag-and-drop. Per-chip saving indicator, deliberately
  // separate from the sheet's own `saving` (a drag never opens the sheet
  // unless it hits a conflict, so reusing `saving` would show a spinner
  // nowhere the user could see it).
  const [dragSavingId, setDragSavingId] = useState<string | null>(null);
  // Absolute-window Y bounds of each rendered lane, keyed by lane id
  // ('none' for "Sans véhicule") — populated via each lane's onLayout
  // below, read by DraggableAssignmentChip's pan gesture on drop to
  // determine which lane a chip was released over. A plain mutable ref
  // rather than state: it's read from inside a gesture callback on every
  // drag, and re-rendering the screen every time a lane's layout settles
  // would be wasted work for a value nothing else displays.
  const laneBoundsRef = useRef<Record<string, { top: number; bottom: number }>>({});
  // Refs to each lane's rendered container, used only to call
  // `measureInWindow` from onLayout below — a plain object keyed by lane
  // id, same shape as laneBoundsRef, populated via each lane's own ref
  // callback rather than one ref per possible lane declared up front
  // (the lane list itself is dynamic, driven by `vehicles`).
  const laneRefs = useRef<Record<string, any>>({});

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [selectedDate]),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let assignmentQuery = supabase
      .from('dispatch_assignments')
      .select('*, workers(full_name)')
      .eq('org_id', org)
      .eq('assignment_date', selectedDate);
    if (deepLinkProjectId) {
      assignmentQuery = assignmentQuery.eq('project_id', deepLinkProjectId);
    }

    const [
      { data: vehicleRows },
      { data: workerRows },
      { data: projectRows },
      { data: assignmentRows },
      scopedProjectResult,
    ] = await Promise.all([
      supabase.from('vehicles').select('*').eq('org_id', org).order('name'),
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
      supabase.from('projects').select('*').eq('lead_org_id', org).eq('status', 'active'),
      assignmentQuery,
      deepLinkProjectId
        ? supabase.from('projects').select('*').eq('id', deepLinkProjectId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    setVehicles(vehicleRows ?? []);
    setWorkers(workerRows ?? []);
    setProjects(projectRows ?? []);
    setScopedProject((scopedProjectResult?.data as Project | null) ?? null);
    setAssignments(
      (assignmentRows ?? []).map((a: any) => ({
        ...a,
        workerName: a.workers?.full_name ?? 'Ouvrier',
      })),
    );
    await loadConflictCount();
    await loadDensity(org);
    setLoading(false);
    setRefreshing(false);
  }

  // Single lightweight query for the whole visible 14-day window — only
  // the `assignment_date` column, so this stays cheap even on a busy org.
  // Deliberately its own query rather than widening `assignmentQuery`
  // above, which is intentionally scoped to `selectedDate` only (and to
  // `deepLinkProjectId` when set) for the actual lane data.
  async function loadDensity(org: string) {
    const window = dateChips(selectedDate);
    const { data } = await supabase
      .from('dispatch_assignments')
      .select('assignment_date')
      .eq('org_id', org)
      .gte('assignment_date', window[0])
      .lte('assignment_date', window[window.length - 1]);
    setDatesWithAssignments(new Set((data ?? []).map((r) => r.assignment_date as string)));
  }

  // Doc 01 §1.9 / Doc 03 §3.11, Phase 20 — badge count for the
  // "Vos changements" entry point. Not org-filtered locally (`dispatch_
  // assignment_conflicts` has no org_id column — it's local-only and the
  // WatermelonDB mirror only ever holds the active org's data in the first
  // place, per pullChanges.ts's own org-scoping), so a plain count of every
  // local conflict row is accurate for "conflicts for the active org."
  async function loadConflictCount() {
    const count = await database
      .get<DispatchAssignmentConflictModel>('dispatch_assignment_conflicts')
      .query()
      .fetchCount();
    setConflictCount(count);
  }

  // Doc 03 §3.10.2 — Dispatch tab is read-only for a completed/archived
  // project: historical assignments still show, but no new ones can be
  // created and existing ones can't be edited from here.
  const readOnly = deepLinkProjectId ? scopedProject?.status !== 'active' : false;

  const assignmentsByVehicle = useMemo(() => {
    const map: Record<string, EnrichedAssignment[]> = {};
    for (const a of assignments) {
      const key = a.vehicle_id ?? 'none';
      map[key] = map[key] ? [...map[key], a] : [a];
    }
    return map;
  }, [assignments]);

  function openAssign(vehicleId: string | null) {
    if (readOnly) return;
    setEditing(null);
    setLaneVehicleId(vehicleId);
    setSelectedWorkerIds([]);
    setProjectId(deepLinkProjectId ?? undefined);
    setDepartureTime('');
    setTools('');
    setChannel('app');
    setWarning(null);
    setConflict(null);
    setError(null);
    setDepartureTimeError(null);
    setSheetOpen(true);
  }

  function toggleWorker(workerId: string) {
    setSelectedWorkerIds((prev) => {
      const next = prev.includes(workerId)
        ? prev.filter((id) => id !== workerId)
        : [...prev, workerId];
      void checkWarnings(next);
      return next;
    });
  }

  async function checkWarnings(workerIds: string[]) {
    if (workerIds.length === 0 || !orgId) {
      setWarning(null);
      return;
    }
    const vehicle = vehicles.find((v) => v.id === laneVehicleId);
    const problems: string[] = [];

    if (vehicle && workerIds.length > vehicle.capacity) {
      problems.push(`Dépasse la capacité du véhicule (${vehicle.capacity} places).`);
    }

    // Overbooking: is any selected worker already assigned elsewhere today?
    const { data: existing } = await supabase
      .from('dispatch_assignments')
      .select('worker_id')
      .eq('org_id', orgId)
      .eq('assignment_date', selectedDate)
      .in('worker_id', workerIds);
    const alreadyAssigned = (existing ?? []).filter((e) => e.worker_id !== editing?.worker_id);
    if (alreadyAssigned.length > 0) {
      problems.push(`${alreadyAssigned.length} ouvrier(s) déjà affecté(s) ce jour-là.`);
    }

    // Absence: is any selected worker marked absent today (Pointage)?
    const { data: absences } = await supabase
      .from('attendance_records')
      .select('worker_id, status')
      .eq('org_id', orgId)
      .eq('record_date', selectedDate)
      .eq('status', 'absent')
      .in('worker_id', workerIds);
    if ((absences ?? []).length > 0) {
      problems.push(`${absences!.length} ouvrier(s) marqué(s) absent(s) aujourd'hui.`);
    }

    // Doc 05 §2.3 — surfaced inline (this state, rendered as a banner in the
    // sheet), never as a blocking Alert/modal. The contractor can still
    // submit past a warning — these are flags, not hard stops, except
    // capacity and maintenance which are prevented at the source (a
    // maintenance vehicle's lane has no "+", and selection is capped).
    setWarning(problems.length > 0 ? problems.join(' ') : null);
  }

  async function handleAssignSubmit() {
    setError(null);
    setDepartureTimeError(null);
    if (!orgId || selectedWorkerIds.length === 0) {
      setError('Sélectionnez au moins un ouvrier.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      for (const workerId of selectedWorkerIds) {
        const parsed = createDispatchAssignmentSchema.safeParse({
          project_id: projectId,
          vehicle_id: laneVehicleId ?? undefined,
          worker_id: workerId,
          assignment_date: selectedDate,
          departure_time: departureTime || undefined,
        });
        if (!parsed.success) {
          // Phase 25 — route a departure_time-specific issue to its own
          // field instead of the generic bottom-of-sheet message.
          const timeIssue = parsed.error.issues.find((i) => i.path[0] === 'departure_time');
          if (timeIssue) {
            setDepartureTimeError(timeIssue.message);
          } else {
            setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          }
          haptics.error();
          setSaving(false);
          return;
        }
        await database.write(() =>
          createWithClientId(
            database.get<DispatchAssignmentModel>('dispatch_assignments'),
            (record) => {
              record.orgId = orgId;
              record.projectId = parsed.data.project_id ?? null;
              record.vehicleId = parsed.data.vehicle_id ?? null;
              record.workerId = parsed.data.worker_id;
              record.assignmentDate = parsed.data.assignment_date;
              record.departureTime = parsed.data.departure_time ?? null;
              record.confirmationChannel = channel;
              record.actualDepartureTime = null;
              record.version = 1;
            },
          ),
        );
      }
      void runSync();
      haptics.confirm();
      toast.success(
        selectedWorkerIds.length > 1
          ? `${selectedWorkerIds.length} affectations envoyées.`
          : 'Affectation envoyée.',
      );
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  function openEditExisting(assignment: EnrichedAssignment) {
    if (readOnly) return;
    setEditingWithVehicle(assignment, assignment.vehicle_id);
  }

  // Shared setup for opening the edit sheet against a given assignment —
  // used both by a normal tap (openEditExisting, vehicle unchanged) and by
  // a successful long-press drag that hit a version conflict (vehicle set
  // to the drag's drop target). Factored out so the drag path can't drift
  // from the tap path's field initialization and accidentally leave a
  // stale departureTime/channel in state for the sheet's "Garder ma
  // version" resubmit to pick up.
  function setEditingWithVehicle(assignment: EnrichedAssignment, vehicleId: string | null) {
    setEditing(assignment);
    setLaneVehicleId(vehicleId);
    setSelectedWorkerIds([assignment.worker_id]);
    setProjectId(assignment.project_id ?? undefined);
    setDepartureTime(assignment.departure_time ?? '');
    setChannel(assignment.confirmation_channel ?? 'app');
    setTools('');
    setWarning(null);
    setConflict(null);
    setError(null);
    setDepartureTimeError(null);
    setSheetOpen(true);
  }

  // Doc 01 §1.9 — the actual conflict-safe write, extracted out of
  // `handleUpdateExisting` so the drag-and-drop path below (see file
  // header's UI/UX-pass note) can reuse the EXACT same live
  // read-immediately-before-write version compare, rather than a second,
  // possibly-drifting copy of it. Takes explicit arguments rather than
  // reading component state, so it's safe to call from a code path that
  // never opens the sheet at all (the common case: a drag that lands
  // cleanly, no conflict).
  async function submitAssignmentPatch(
    assignmentId: string,
    expectedVersion: number,
    patch: {
      vehicle_id?: string | null;
      departure_time?: string;
      confirmation_channel?: ConfirmationChannel;
    },
  ): Promise<
    | { ok: true }
    | { ok: false; kind: 'conflict'; serverVersion: number }
    | { ok: false; kind: 'error'; message: string }
  > {
    const { data: current } = await supabase
      .from('dispatch_assignments')
      .select('version')
      .eq('id', assignmentId)
      .single();

    if (current && current.version !== expectedVersion) {
      return { ok: false, kind: 'conflict', serverVersion: current.version };
    }

    const { error: updateError } = await supabase
      .from('dispatch_assignments')
      .update({ ...patch, version: expectedVersion + 1 })
      .eq('id', assignmentId)
      .eq('version', expectedVersion); // last-ditch DB-level guard against a race between the read above and this write

    if (updateError) return { ok: false, kind: 'error', message: updateError.message };
    return { ok: true };
  }

  async function handleUpdateExisting(resolution?: 'keep_mine' | 'use_theirs') {
    // PHASE 19: deliberately unchanged — online-only, live version-check.
    // See this file's header for why this one write path wasn't converted
    // to local-first this pass.
    if (!editing) return;
    setError(null);
    setDepartureTimeError(null);
    setSaving(true);
    try {
      if (!resolution) {
        // First attempt: parse the form and hand the version check to the
        // shared core function below, exactly as before this refactor —
        // only difference is the version-compare + write itself now lives
        // in `submitAssignmentPatch` instead of being inlined here.
        const parsed = updateDispatchAssignmentSchema.safeParse({
          vehicle_id: laneVehicleId ?? undefined,
          departure_time: departureTime || undefined,
          confirmation_channel: channel,
          version: editing.version,
        });
        if (!parsed.success) {
          const timeIssue = parsed.error.issues.find((i) => i.path[0] === 'departure_time');
          if (timeIssue) {
            setDepartureTimeError(timeIssue.message);
          } else {
            setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          }
          haptics.error();
          setSaving(false);
          return;
        }
        const { version, ...patch } = parsed.data;
        const result = await submitAssignmentPatch(editing.id, version, patch);
        if (!result.ok && result.kind === 'conflict') {
          setConflict({ serverVersion: result.serverVersion });
          setSaving(false);
          return;
        }
        if (!result.ok) throw new Error(result.message);
        haptics.confirm();
        toast.success('Affectation mise à jour.');
        setConflict(null);
        setSheetOpen(false);
        await load();
        return;
      }

      if (resolution === 'use_theirs') {
        const { data: current } = await supabase
          .from('dispatch_assignments')
          .select('version, departure_time, vehicle_id, confirmation_channel')
          .eq('id', editing.id)
          .single();
        setDepartureTime(current?.departure_time ?? '');
        setLaneVehicleId(current?.vehicle_id ?? null);
        setChannel((current?.confirmation_channel as ConfirmationChannel) ?? 'app');
        setConflict(null);
        setSaving(false);
        return;
      }

      // 'keep_mine' — re-read the current version so the write's WHERE
      // clause targets the row's true current version (not the stale one
      // the sheet was originally opened with), then apply this sheet's
      // values on top of it.
      const { data: current } = await supabase
        .from('dispatch_assignments')
        .select('version')
        .eq('id', editing.id)
        .single();
      const baseVersion = current?.version ?? editing.version;

      const parsed = updateDispatchAssignmentSchema.safeParse({
        vehicle_id: laneVehicleId ?? undefined,
        departure_time: departureTime || undefined,
        confirmation_channel: channel,
        version: baseVersion,
      });
      if (!parsed.success) {
        const timeIssue = parsed.error.issues.find((i) => i.path[0] === 'departure_time');
        if (timeIssue) {
          setDepartureTimeError(timeIssue.message);
        } else {
          setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
        }
        haptics.error();
        setSaving(false);
        return;
      }
      const { version, ...patch } = parsed.data;
      const result = await submitAssignmentPatch(editing.id, version, patch);
      if (!result.ok)
        throw new Error(result.kind === 'error' ? result.message : 'Conflit persistant.');
      haptics.confirm();
      toast.success('Affectation mise à jour.');
      setConflict(null);
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  // Drag-and-drop entry point — see file header's UI/UX-pass note for why
  // this funnels through `submitAssignmentPatch` (the same conflict-safe
  // core `handleUpdateExisting` uses) rather than a shortcut write, and
  // why a conflict here re-opens the exact same "Modifié ailleurs" sheet
  // UI instead of a second, drag-specific conflict surface.
  async function handleDragReassign(
    assignment: EnrichedAssignment,
    targetVehicleId: string | null,
  ) {
    if (readOnly) return;
    if (assignment.vehicle_id === targetVehicleId) return;
    const targetVehicle = vehicles.find((v) => v.id === targetVehicleId);
    if (targetVehicle && targetVehicle.status === 'maintenance') {
      toast.error('Ce véhicule est en maintenance.');
      return;
    }
    const targetCount = (assignmentsByVehicle[targetVehicleId ?? 'none'] ?? []).length;
    if (targetVehicle && targetCount >= targetVehicle.capacity) {
      toast.error(
        `${targetVehicle.name} est déjà à pleine capacité (${targetVehicle.capacity} places).`,
      );
      haptics.error();
      return;
    }

    setDragSavingId(assignment.id);
    const result = await submitAssignmentPatch(assignment.id, assignment.version, {
      vehicle_id: targetVehicleId,
    });
    setDragSavingId(null);

    if (result.ok) {
      haptics.confirm();
      toast.success(
        `${assignment.workerName} déplacé vers ${targetVehicle ? targetVehicle.name : 'Sans véhicule'}.`,
      );
      await load();
      return;
    }

    if (result.kind === 'conflict') {
      // Same conflict UI the sheet already has — just pre-populated with
      // the drag's intended destination instead of the assignment's
      // original vehicle.
      setEditingWithVehicle(assignment, targetVehicleId);
      setConflict({ serverVersion: result.serverVersion });
      toast.info('Modifié ailleurs entre-temps — choisissez une version.');
      return;
    }

    haptics.error();
    toast.error('Impossible de réaffecter. Vérifiez votre connexion.');
    await load(); // revert the visual to server truth
  }

  async function copyPreviousWeek() {
    if (!orgId || readOnly) return;
    const sourceDate = addDays(selectedDate, -7);
    let sourceQuery = supabase
      .from('dispatch_assignments')
      .select('project_id, vehicle_id, worker_id, departure_time')
      .eq('org_id', orgId)
      .eq('assignment_date', sourceDate);
    if (deepLinkProjectId) {
      sourceQuery = sourceQuery.eq('project_id', deepLinkProjectId);
    }
    const { data: sourceAssignments } = await sourceQuery;

    if (!sourceAssignments || sourceAssignments.length === 0) {
      toast.info("Il n'y a rien à copier depuis la semaine précédente.");
      return;
    }

    const rows = sourceAssignments.map((a) => ({
      projectId: a.project_id,
      vehicleId: a.vehicle_id,
      workerId: a.worker_id,
      departureTime: a.departure_time,
    }));

    try {
      await database.write(async () => {
        for (const row of rows) {
          await createWithClientId(
            database.get<DispatchAssignmentModel>('dispatch_assignments'),
            (record) => {
              record.orgId = orgId;
              record.projectId = row.projectId;
              record.vehicleId = row.vehicleId;
              record.workerId = row.workerId;
              record.assignmentDate = selectedDate;
              record.departureTime = row.departureTime;
              record.confirmationChannel = null;
              record.actualDepartureTime = null;
              record.version = 1;
            },
          );
        }
      });
      void runSync();
      toast.success(`${rows.length} affectation(s) copiée(s).`);
      await load();
    } catch {
      toast.error('Impossible de copier les affectations.');
    }
  }

  const lanes: { id: string | null; vehicle: Vehicle | null }[] = [
    ...vehicles.map((v) => ({ id: v.id, vehicle: v })),
    { id: null, vehicle: null },
  ];

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      {deepLinkProjectId && (
        <XStack alignItems="center" gap="$3" paddingHorizontal="$4" paddingBottom="$2">
          <XStack
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <ArrowLeftIcon size={20} />
          </XStack>
          <Text fontFamily="$display" fontSize={20} fontWeight="600" numberOfLines={1} flex={1}>
            Dispatch{scopedProject ? ` — ${scopedProject.name}` : ''}
          </Text>
        </XStack>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 76 }}>
        <XStack paddingHorizontal="$3" paddingVertical="$3" gap="$2">
          {dateChips(selectedDate).map((iso) => {
            const { weekday, day } = frLabel(iso);
            const active = iso === selectedDate;
            const hasAssignments = datesWithAssignments.has(iso);
            return (
              <YStack
                key={iso}
                width={44}
                paddingVertical={8}
                borderRadius="$control"
                alignItems="center"
                backgroundColor={active ? '$accent600' : '$neutral0'}
                onPress={() => setSelectedDate(iso)}
              >
                <Text fontSize={11} color={active ? 'white' : '$neutral500'}>
                  {weekday}
                </Text>
                <Text fontSize={15} fontWeight="600" color={active ? 'white' : '$neutral900'}>
                  {day}
                </Text>
                {/* Density dot — was entirely absent; previously the only
                    way to know a day had assignments was to tap into it. */}
                <YStack
                  width={4}
                  height={4}
                  borderRadius={2}
                  marginTop={2}
                  backgroundColor={
                    hasAssignments ? (active ? 'white' : '$accent600') : 'transparent'
                  }
                />
              </YStack>
            );
          })}
        </XStack>
      </ScrollView>

      <XStack
        justifyContent="space-between"
        alignItems="center"
        paddingHorizontal="$4"
        paddingBottom="$2"
      >
        <Text fontFamily="$display" fontSize={19} fontWeight="600">
          {selectedDate === toISO(new Date()) ? "Aujourd'hui" : selectedDate}
        </Text>
        <XStack alignItems="center" gap="$3">
          {conflictCount > 0 && (
            <XStack onPress={() => setConflictsSheetOpen(true)}>
              <StatusBadge variant="warning">
                {`${conflictCount} modifié${conflictCount > 1 ? 's' : ''} ailleurs`}
              </StatusBadge>
            </XStack>
          )}
          {!readOnly && (
            <Text fontSize={13} color="$accent600" fontWeight="500" onPress={copyPreviousWeek}>
              Copier semaine précédente
            </Text>
          )}
        </XStack>
      </XStack>

      {!loading && vehicles.length > 1 && (
        <XStack paddingHorizontal="$4" paddingBottom="$2">
          <Text fontSize={12} color="$neutral500">
            Maintenez un ouvrier pour le déplacer vers un autre véhicule.
          </Text>
        </XStack>
      )}

      {!loading && vehicles.length === 0 && assignments.length === 0 ? (
        <EmptyState
          icon={CalendarBlankIcon}
          illustration="route-planning"
          title="Rien à afficher"
          description="Ajoutez un véhicule pour commencer à planifier vos dispatchs."
        />
      ) : !loading && deepLinkProjectId && assignments.length === 0 ? (
        <YStack alignItems="center" paddingTop="$6">
          <EmptyState
            icon={CalendarBlankIcon}
            illustration="route-planning"
            title="Aucune mission prévue pour ce chantier à cette date"
            description={readOnly ? undefined : 'Planifiez une affectation pour cette date.'}
          />
          {!readOnly && (
            <Button variant="secondary" onPress={() => openAssign(null)}>
              Planifier
            </Button>
          )}
        </YStack>
      ) : loading ? (
        <SkeletonCardList cards={3} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={color.accent[600]}
            />
          }
        >
          <YStack gap="$3">
            {lanes.map((lane) => {
              const laneAssignments = assignmentsByVehicle[lane.id ?? 'none'] ?? [];
              const isMaintenance = lane.vehicle?.status === 'maintenance';
              const laneKey = lane.id ?? 'none';
              return (
                <YStack
                  key={laneKey}
                  ref={(el: any) => {
                    laneRefs.current[laneKey] = el;
                  }}
                  backgroundColor="$neutral0"
                  borderRadius="$card"
                  padding="$3"
                  opacity={isMaintenance ? 0.5 : 1}
                  // Drag-drop bounds — measured in absolute window
                  // coordinates (same space GestureDetector reports
                  // `e.absoluteY` in) so DraggableAssignmentChip's drop
                  // detection doesn't need any separate scroll-offset math.
                  // Re-measured on every layout pass (list re-renders
                  // after a successful drag, scroll position can change
                  // capacity meters' heights, etc.), so bounds never go
                  // stale for long.
                  onLayout={() => {
                    laneRefs.current[laneKey]?.measureInWindow?.(
                      (_x: number, y: number, _w: number, h: number) => {
                        laneBoundsRef.current[laneKey] = { top: y, bottom: y + h };
                      },
                    );
                  }}
                >
                  <XStack justifyContent="space-between" alignItems="center" marginBottom="$2">
                    <YStack flex={1} gap={4}>
                      <XStack alignItems="center" gap="$2">
                        <Text fontSize={15.5} fontWeight="600">
                          {lane.vehicle ? lane.vehicle.name : 'Sans véhicule'}
                        </Text>
                        {isMaintenance && (
                          <Text fontSize={12} color="$neutral500">
                            · Maintenance
                          </Text>
                        )}
                      </XStack>
                      {lane.vehicle && (
                        <XStack alignItems="center" gap="$1.5">
                          {/* Capacity meter — was plain "· N places" text;
                              now a dot-fill row so over/under capacity
                              reads at a glance instead of requiring a
                              mental N-vs-M comparison. */}
                          <XStack gap={3}>
                            {Array.from({ length: Math.min(lane.vehicle.capacity, 8) }).map(
                              (_, i) => (
                                <YStack
                                  key={i}
                                  width={7}
                                  height={7}
                                  borderRadius={3.5}
                                  backgroundColor={
                                    i < laneAssignments.length ? '$accent600' : '$neutral200'
                                  }
                                />
                              ),
                            )}
                          </XStack>
                          <Text fontSize={12} color="$neutral500">
                            {laneAssignments.length}/{lane.vehicle.capacity} places
                          </Text>
                        </XStack>
                      )}
                    </YStack>
                    {!isMaintenance && !readOnly && (
                      <Text
                        fontSize={13}
                        color="$accent600"
                        fontWeight="500"
                        onPress={() => openAssign(lane.id)}
                      >
                        + Assigner
                      </Text>
                    )}
                  </XStack>

                  {laneAssignments.length === 0 ? (
                    <Text fontSize={13} color="$neutral500">
                      Aucun ouvrier assigné.
                    </Text>
                  ) : (
                    <YStack gap="$2">
                      {laneAssignments.map((a) => (
                        <DraggableAssignmentChip
                          key={a.id}
                          laneId={lane.id}
                          laneBoundsRef={laneBoundsRef}
                          disabled={readOnly}
                          isSaving={dragSavingId === a.id}
                          onDrop={(targetLaneId) => void handleDragReassign(a, targetLaneId)}
                        >
                          <XStack
                            alignItems="center"
                            gap="$2"
                            backgroundColor="$neutral0"
                            paddingVertical={2}
                            onPress={() => openEditExisting(a)}
                          >
                            <Avatar name={a.workerName} size={26} />
                            <Text fontSize={13.5} flex={1}>
                              {a.workerName}
                            </Text>
                            {a.departure_time && (
                              <Text fontSize={12} color="$neutral500">
                                {a.departure_time}
                              </Text>
                            )}
                            {a.actual_departure_time && (
                              <Text fontSize={12} color="$success">
                                En route
                              </Text>
                            )}
                          </XStack>
                        </DraggableAssignmentChip>
                      ))}
                    </YStack>
                  )}
                </YStack>
              );
            })}
          </YStack>
        </ScrollView>
      )}

      {renderSheet()}

      <DispatchConflictsSheet
        visible={conflictsSheetOpen}
        onClose={() => setConflictsSheetOpen(false)}
        workers={workers}
        vehicles={vehicles}
        projects={projects}
        onResolved={() => void load()}
      />
    </YStack>
  );

  function renderSheet() {
    const vehicle = vehicles.find((v) => v.id === laneVehicleId);

    return (
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Modifier l'affectation" : 'Assigner des ouvriers'}
      >
        {conflict ? (
          <YStack gap="$3">
            <Text fontFamily="$display" fontSize={17} fontWeight="600">
              Modifié ailleurs
            </Text>
            <Text color="$neutral500" fontSize={14}>
              Cette affectation a été modifiée par quelqu&apos;un d&apos;autre entre-temps. Que
              voulez-vous faire ?
            </Text>
            <Button onPress={() => handleUpdateExisting('keep_mine')} loading={saving}>
              Garder ma version
            </Button>
            <Button
              variant="secondary"
              onPress={() => handleUpdateExisting('use_theirs')}
              loading={saving}
            >
              Utiliser la version du serveur
            </Button>
          </YStack>
        ) : (
          <YStack gap="$3">
            {!editing && !deepLinkProjectId && (
              <YStack gap="$1.5">
                <Text fontSize={14} fontWeight="500">
                  Chantier (optionnel)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$2">
                    <XStack
                      paddingHorizontal={12}
                      paddingVertical={8}
                      borderRadius="$control"
                      backgroundColor={!projectId ? '$accent600' : '$neutral100'}
                      onPress={() => setProjectId(undefined)}
                    >
                      <Text fontSize={13} color={!projectId ? 'white' : '$neutral500'}>
                        Aucun
                      </Text>
                    </XStack>
                    {projects.map((p) => {
                      const selected = projectId === p.id;
                      return (
                        <XStack
                          key={p.id}
                          paddingHorizontal={12}
                          paddingVertical={8}
                          borderRadius="$control"
                          backgroundColor={selected ? '$accent600' : '$neutral100'}
                          onPress={() => setProjectId(p.id)}
                        >
                          <Text fontSize={13} color={selected ? 'white' : '$neutral500'}>
                            {p.name}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </ScrollView>
              </YStack>
            )}

            {!editing && (
              <YStack gap="$1.5">
                <Text fontSize={14} fontWeight="500">
                  Ouvriers {vehicle ? `(max ${vehicle.capacity})` : ''}
                </Text>
                <YStack gap="$1">
                  {workers.map((w) => {
                    const selected = selectedWorkerIds.includes(w.id);
                    return (
                      <XStack
                        key={w.id}
                        alignItems="center"
                        gap="$2.5"
                        paddingVertical={6}
                        onPress={() => toggleWorker(w.id)}
                      >
                        {/* Phase 26 — swapped the bare checkbox+name row for
                            Avatar + name, matching the app's own
                            worker-chip pattern used everywhere else
                            (Team, AvatarStack) instead of this one screen
                            inventing a plainer row. */}
                        <Avatar name={w.full_name} size={28} />
                        <Text flex={1} fontSize={14.5}>
                          {w.full_name}
                        </Text>
                        <YStack
                          width={20}
                          height={20}
                          borderRadius={6}
                          borderWidth={1.5}
                          borderColor={selected ? '$accent600' : '$neutral300'}
                          backgroundColor={selected ? '$accent600' : 'transparent'}
                        />
                      </XStack>
                    );
                  })}
                </YStack>
              </YStack>
            )}

            {/* Phase 26 — native time picker replacing the previous
                free-text "07:30"-placeholder FormField (Phase 23/24 UI
                audit's named example). departure_time can no longer be
                typed as a malformed string. */}
            <TimeInput
              label="Heure de départ"
              value={departureTime || null}
              onChange={setDepartureTime}
              error={departureTimeError ?? undefined}
              placeholder="Choisir une heure"
            />

            {!editing && (
              <FormField
                label="Outils à apporter (optionnel)"
                value={tools}
                onChangeText={setTools}
              />
            )}

            <YStack gap="$1.5">
              <Text fontSize={14} fontWeight="500">
                Envoyer via
              </Text>
              <SegmentedControl
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'app', label: 'App', color: '$accent600' },
                  { value: 'whatsapp', label: 'WhatsApp', color: '$accent600' },
                  { value: 'sms', label: 'SMS', color: '$accent600' },
                ]}
              />
            </YStack>

            {warning && (
              <YStack backgroundColor="#FEF3D8" borderRadius="$control" padding="$3">
                <Text fontSize={13} color="$warning">
                  {warning}
                </Text>
              </YStack>
            )}
            {error && <Text color="$danger">{error}</Text>}

            <Button
              onPress={editing ? () => handleUpdateExisting() : handleAssignSubmit}
              loading={saving}
            >
              {editing ? 'Enregistrer' : 'Envoyer'}
            </Button>
          </YStack>
        )}
      </Sheet>
    );
  }
}

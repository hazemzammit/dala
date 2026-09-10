import { color } from '@dala/design-tokens';
import type { Project, SiteLog, Worker } from '@dala/shared-types';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  GridFourIcon,
  ImageIcon,
  ListIcon,
  MapPinIcon,
  MicrophoneIcon,
  NoteIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { SiteLogForm } from '@/components/journal/SiteLogForm';
import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { SearchFilterBar } from '@/components/ui/SearchFilterBar';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonTimeline } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useUndoToast, UndoToast } from '@/components/ui/UndoToast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { useFabBottomContentInset } from '@/lib/fabLayout';
import { haptics } from '@/lib/haptics';
import { cycleStartISO, todayISO } from '@/lib/salaryCycle';
import { staticMapUrl } from '@/lib/staticMap';
import { getSignedUrl, getSignedUrlMap } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/journal.tsx
 *
 * Doc 03 §3.16 — reverse-chronological timeline per project, photo/voice/
 * text entries, tap for full-screen detail (caption, worker, timestamp,
 * location tag if captured).
 *
 * Per-project (a project picker at the top), same simplification
 * expenses.tsx already established for "Projects CRUD doesn't exist yet"
 * rather than reinventing a different pattern here. Phase 10 adds
 * `project/[id].tsx` (Doc 03 §3.10.2's hub); this screen now accepts an
 * optional `project_id` deep-link param from it and locks to that project
 * instead of showing its own picker — same additive pattern as
 * expenses.tsx's own Phase 10 change, not a rewrite.
 *
 * Every photo/thumbnail/voice-note URL in the row list and the detail
 * sheet is a fresh 1-hour signed URL minted on read (getSignedUrl,
 * lib/storage.ts) — the DB only ever stores the storage path, per Doc 01
 * §1.3.11. This means a long-open list can have URLs quietly expire after
 * an hour; not solved here (a reasonable Phase-3 scope cut, called out in
 * the delivery guide) — pull-to-refresh / re-focusing the screen re-mints
 * them, same as any other screen that reloads on focus already does.
 * Playback uses expo-audio's useAudioPlayer. Do NOT add a manual
 * `useEffect(() => () => player?.remove?.(), [player])` cleanup here —
 * useAudioPlayer already releases its underlying native player itself
 * whenever `detailVoiceUrl` changes or the component unmounts (it's built
 * on Expo's shared-object auto-release pattern). A prior version of this
 * file duplicated that cleanup manually, which raced with the hook's own
 * release and crashed with "Cannot use shared object that was already
 * released" every time the detail sheet closed. If future playback
 * controls need cleanup, hook into that lifecycle rather than re-adding
 * a manual `.remove()` call.
 *
 * UI/UX pass: this was the thinnest screen in the app relative to what a
 * site journal should be — a flat card list with no sense that entries are
 * sequential. Adds a connecting timeline rail (vertical line + per-entry
 * dot) down the left edge, an author `Avatar` per entry (previously text
 * only), and pull-to-refresh (the signed thumbnail/voice URLs this screen
 * mints expire after an hour per the storage note above, so refresh is
 * more than cosmetic here).
 *
 * IMPROVEMENT-PLAN PHASE 2 (§1.2 steps 1–2):
 *
 *   1. Add-entry FAB — the contractor was previously a spectator on their
 *      own project journal (only workers could log an entry, via
 *      `(worker)/update-chantier.tsx`'s dispatch-linked flow). The FAB
 *      opens a `Sheet` around the same `SiteLogForm` that screen now
 *      shares (see that component's own header) — identical photo/voice/
 *      text inputs, identical upload pipeline, identical local-first
 *      write. `projectId` is whichever project is currently selected
 *      (picker or deep-link, same `selectedProjectId` the rest of this
 *      screen already reads); `userId` is the contractor's own session id.
 *      Only rendered once a project is actually selected — matches the
 *      existing empty-state guard below (no project = nothing to attach
 *      an entry to).
 *
 *      DEPENDENCY FOUND, FIXED NOT DEFERRED: `submit_site_log_entry()`,
 *      the RPC every site-log write pushes through, unconditionally
 *      rejected any caller with no `workers` row — which is every
 *      contractor/org-owner. Wiring this FAB on top of that unchanged
 *      would have shipped a button that looks like it works (the local
 *      WatermelonDB write always succeeds) but silently fails to sync,
 *      forever. Fixed in migration `0069`, a small, targeted permission-
 *      check widening — see that file's own header for the full
 *      reasoning on why this was fixed here rather than flagged and
 *      pushed to a later phase.
 *
 *   2. Date-grouped sections — the single unbroken timeline rail is now
 *      split into "Aujourd'hui" / "Hier" / "Cette semaine" / "Plus ancien"
 *      sections, each with its own short rail (same rail/dot visual as
 *      before, just re-run per bucket instead of once across the whole
 *      list). JUDGMENT CALL beyond the plan's literal 3 named buckets:
 *      added a 4th "Plus ancien" bucket for anything older than the
 *      current week — the plan names "Aujourd'hui / Hier / Cette semaine"
 *      but doesn't say what happens to older entries, and silently
 *      dropping them from any section (or leaving them permanently stuck
 *      under "Cette semaine") would both be worse than one more clearly-
 *      labeled bucket. Week boundary reuses `cycleStartISO()`
 *      (lib/salaryCycle.ts) — the same Monday-start week every other
 *      screen in the app already agrees on, not a second week
 *      calculation invented here.
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.2 steps 3–6) — the remaining §1.2 work:
 *
 *   3. Filter row (author / type / date range) — three compact chip rows
 *      below the project picker, above the timeline, rather than one
 *      combined row or a full filter sheet. JUDGMENT CALL: three
 *      independent facets read more clearly as three short labeled rows
 *      than as one long mixed row of chips a reader has to parse apart —
 *      still far lighter than a filter sheet, and each row scrolls
 *      independently so it never wraps awkwardly. "Type" is inferred
 *      client-side from which of photo_url/voice_note_url/note_text is
 *      set (same precedence the row list's own thumbnail-vs-icon branch
 *      already uses). "Date range" is chip presets (Tout/Aujourd'hui/
 *      Cette semaine/Ce mois) rather than a from/to picker — kept
 *      consistent with "keep the filter UI compact," and these presets
 *      answer the realistic "when was this" questions without a second,
 *      heavier date-range control this screen didn't otherwise need.
 *      "Author" lists distinct `logged_by` values via the same
 *      `loggedByName()` resolution the detail sheet already uses.
 *
 *   4. Edit-caption / soft-delete — migration `0072` adds
 *      `site_logs.deleted_at` plus `soft_delete_site_log`/
 *      `restore_site_log`/`update_site_log_caption` RPCs (same
 *      SECURITY DEFINER + in-function gating shape as 0025's
 *      soft_delete_worker/restore_worker, since site_logs carries no
 *      UPDATE/DELETE RLS policy at all by design — see 0072's own header).
 *      `loadLogs()` now filters `.is('deleted_at', null)` client-side,
 *      same convention this file's own `load()` already applies to
 *      `projects.deleted_at` — no SELECT policy change needed.
 *
 *      SYNC-ENGINE JUDGMENT CALL, confirmed by reading the code before
 *      deciding, not assumed: `db/sync/pushChanges.ts`'s `pushSiteLogs()`
 *      already explicitly REJECTS any local WatermelonDB UPDATE to
 *      `site_logs` ("this table is append-only; the update was NOT
 *      pushed"). Combined with this screen's own `loadLogs()` already
 *      reading live from `supabase.from('site_logs')` (never from the
 *      local WatermelonDB mirror, confirmed by reading that function),
 *      edit and delete below are LIVE `supabase.rpc()` calls made
 *      directly from this screen — never routed through
 *      `database.write()`/`createWithClientId` the way entry CREATION
 *      still is. This is genuinely different sync treatment from
 *      `absence_reason` (Phase 4): that field is set once, at local
 *      creation, and flows through the normal offline-first push path
 *      unchanged; `deleted_at`/caption edits are transitions on an
 *      already-synced row that only ever happen online, through a
 *      dedicated RPC — there is no offline path for either action this
 *      phase, and none was invented, matching this pair of existing
 *      online-only RPC calls elsewhere in this exact file's sibling
 *      screen (`advances.tsx`'s `handleApprove`/`handleMarkPaid`, also
 *      plain `supabase.rpc()`, never routed through WatermelonDB).
 *      `packages/shared-types`' `SiteLog` interface gained `deleted_at`
 *      (this screen's `logs: SiteLog[]` reads it directly from Supabase);
 *      the local WatermelonDB `SiteLog` model/schema did NOT — see that
 *      model's own header (already documented "No deletedAt/tombstone
 *      field on this model" as a deliberate choice) and `0072`'s own
 *      migration header for the full reasoning on why the two diverge.
 *
 *      Edit/delete affordances (pencil/trash) show in the detail sheet
 *      only when `canManageLog(detail)` — the entry's own author OR an
 *      owner/manager of the active org, mirroring this file's existing
 *      FAB-visibility gate shape and `lib/activeOrg.ts`'s own documented
 *      "UX convenience only" framing (`getMyOrgRole` never IS the
 *      authorization boundary — the RPC's own in-function gating is).
 *      Delete asked for confirmation via `Alert.alert` through Phase 6.
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.1, §9.2) —
 *
 *   - Delete now uses the shared `UndoToast` (components/ui/UndoToast.tsx)
 *     instead of a blocking `Alert.alert` — §9.2's own framing names a
 *     journal entry as exactly the "lower-stakes delete" case that should
 *     get a lighter "Supprimé · Annuler" toast, not a modal confirm.
 *     `restore_site_log()` (already built Phase 6, never wired anywhere
 *     until now) is what the toast's "Annuler" tap calls. The soft-delete
 *     RPC fires immediately on tap (optimistic-delete pattern — see
 *     `UndoToast.tsx`'s own header for the full timing model), and the row
 *     is removed from `logs` client-side right away rather than waiting
 *     for a reload, so the list updates instantly the way the old
 *     `Alert.alert` flow's `await loadLogs()` never quite matched (that
 *     round trip was a network call before the row actually disappeared).
 *     `trash.tsx` NOW also surfaces soft-deleted journal entries — the
 *     scope cut PHASE_6_BRIEF.md §2 disclosed ("restore_site_log() built,
 *     not wired into trash.tsx") is closed this phase, per §9.2's own
 *     "extend trash/restore to vehicles and journal entries" wording.
 *   - Search (§9.1) — a `Rechercher` field above the filter chip rows,
 *     filtering the already-fetched `logs` list client-side by caption/
 *     note_text/author name. Same precedent `projects.tsx`'s own header
 *     comment already documents ("filters client-side over the
 *     already-fetched list rather than calling the search_rpc — simpler,
 *     and fine at the list sizes one org actually has") — `site_logs` has
 *     no `search_vector` column (confirmed by grepping every migration),
 *     so this is the only option without a new migration, and matches the
 *     scale this screen already operates at (one project's logs, already
 *     bucketed into weekly-ish groups).
 *
 *      Caption editing is a small inline `FormField` + Enregistrer/
 *      Annuler pair built directly in this screen's detail sheet, NOT a
 *      reuse of `SiteLogForm` — JUDGMENT CALL: `SiteLogForm` is a
 *      multi-field creation form (photo/voice/text/upload pipeline);
 *      repurposing it with a pre-fill/edit-mode prop just to expose one
 *      text field would be more machinery than a single-field edit needs.
 *
 *   5. Voice playback — replaced the old bare `PlayIcon`-only row with
 *      `useAudioPlayerStatus(player)` (expo-audio's reactive status hook;
 *      confirmed against the installed 0.4.9 package's own type
 *      definitions before using it — `currentTime`/`duration`/`playing`
 *      all exist on the returned `AudioStatus`, not guessed at). Adds a
 *      Play/Pause toggle (`player.pause()` was never callable before —
 *      the old row only ever called `.play()`) and a scrub-able progress
 *      bar (`player.seekTo(seconds)`) with elapsed/total time.
 *
 *   6. Grid/gallery toggle — a small List/Grid icon pair above the
 *      timeline switches `viewMode`. Grid mode shows ONLY photo-bearing
 *      entries as a 3-column thumbnail grid (tap opens the same detail
 *      sheet as list mode) — JUDGMENT CALL, disclosed: voice/text entries
 *      are NOT shown as placeholder tiles in grid mode. A grid is
 *      fundamentally a photo-gallery interaction (the plan's own
 *      "photo-heavy projects" framing); forcing two entry types with no
 *      visual content into square placeholder tiles would add visual
 *      noise without adding anything gallery mode is actually for. Non-
 *      photo entries aren't silently dropped, though — a small count line
 *      above the grid states how many voice/text entries exist in the
 *      current filtered set and aren't shown here, with a nudge back to
 *      list mode to see them.
 */
export default function JournalScreen() {
  const { project_id: deepLinkProjectId } = useLocalSearchParams<{ project_id?: string }>();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const fabBottomInset = useFabBottomContentInset();
  // Phase 20 (§1.7a) — the projects/workers query in load() and the
  // primary site_logs query in loadLogs() had no error capture; a
  // failure previously rendered "Aucun chantier" or a silently-empty
  // timeline, indistinguishable from genuinely having none.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>({});
  // Phase 3 §4.1 — one signed URL per distinct site_logs.logged_by author,
  // already resolved through the profiles.avatar_url-over-workers.photo_url
  // priority (same as team.tsx/worker/[id].tsx). Keyed by `logged_by`
  // (a user_id) directly, not by path, since two different authors could
  // in principle share nothing to de-dupe on here — small list either way.
  const [authorPhotoUrlByUserId, setAuthorPhotoUrlByUserId] = useState<Record<string, string>>({});

  const [addOpen, setAddOpen] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string | null>(null);
  const [detailVoiceUrl, setDetailVoiceUrl] = useState<string | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = useState(false);

  const player = useAudioPlayer(detailVoiceUrl ?? undefined);
  // Phase 6 §1.2 step 5 — reactive playback state (currentTime/duration/
  // playing), confirmed against expo-audio 0.4.9's own AudioStatus type
  // before using it. See file header for why this replaces the old
  // play-only row.
  const playerStatus = useAudioPlayerStatus(player);

  // Phase 6 §1.2 step 4 — UX-only gate for showing the edit/delete
  // affordances; the actual authorization boundary is the RPCs' own
  // in-function gating (0072), same "convenience, not the boundary"
  // framing lib/activeOrg.ts's own getMyOrgRole() header already states.
  const [myOrgRole, setMyOrgRole] = useState<'owner' | 'manager' | 'viewer' | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  // Phase 6 §1.2 step 5 — measured width of the voice-note progress bar,
  // needed to convert a tap's x-position into a seekTo() second offset.
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  // Phase 6 §1.2 step 3 — filter row state. 'all' is the unset/"Tous"
  // value for each facet, kept as a real option in each chip row rather
  // than a separate "clear filters" control.
  const [filterAuthor, setFilterAuthor] = useState<string | 'all'>('all');
  const [filterType, setFilterType] = useState<'photo' | 'voice' | 'text' | 'all'>('all');
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'today' | 'week' | 'month'>('all');
  // Phase 11 §9.1 — client-side search over the already-fetched logs list.
  const [search, setSearch] = useState('');

  // Phase 11 §9.2 — undo-toast state for the delete flow. `pendingDeleteLog`
  // holds the ENTIRE log row (not just its id) so "Annuler" can restore it
  // to `logs` locally without a reload, and so its own author/caption text
  // is still available for the toast message even after it's been removed
  // from `logs`.
  const undoToast = useUndoToast();
  const [pendingDeleteLog, setPendingDeleteLog] = useState<SiteLog | null>(null);

  // Phase 6 §1.2 step 6 — list/grid toggle.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedProjectId) void loadLogs(selectedProjectId);
    }, [selectedProjectId]),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const [org, session] = await Promise.all([
      getActiveOrgId(),
      supabase.auth.getSession().then(({ data }) => data.session),
    ]);
    setOrgId(org);
    setUserId(session?.user.id ?? null);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    // Phase 6 §1.2 step 4 — UX-only role lookup for the edit/delete gate.
    void getMyOrgRole(org).then(setMyOrgRole);

    const [{ data: projectRows, error: projectsError }, { data: workerRows, error: workersError }] =
      await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('lead_org_id', org)
          .is('deleted_at', null)
          .order('name'),
        supabase.from('workers').select('*').eq('org_id', org),
      ]);
    if (projectsError || workersError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const list = (projectRows as Project[] | null) ?? [];
    setProjects(list);
    setWorkers((workerRows as Worker[] | null) ?? []);
    if (list.length > 0) {
      const initial =
        deepLinkProjectId && list.some((p) => p.id === deepLinkProjectId)
          ? deepLinkProjectId
          : list[0]!.id;
      setSelectedProjectId((current) => current ?? initial);
      await loadLogs(initial);
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function loadLogs(projectId: string) {
    const { data, error } = await supabase
      .from('site_logs')
      .select('*')
      .eq('project_id', projectId)
      // Phase 6 §1.2 step 4 — site_logs carries no SELECT-policy change
      // for deleted_at (0072); filtered client-side instead, same
      // convention this function's own caller (load()) already applies
      // to projects.deleted_at above.
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError(true);
      return;
    }
    const rows = (data as SiteLog[] | null) ?? [];
    setLogs(rows);

    const entries = await Promise.all(
      rows.map(
        async (log) => [log.id, await getSignedUrl(log.thumbnail_url ?? log.photo_url)] as const,
      ),
    );
    setThumbUrls(Object.fromEntries(entries));

    // Phase 3 §4.1 — resolve each distinct author's photo. `site_logs.
    // logged_by` is a user_id that may or may not have a `workers` row
    // (Phase 2 §1.2 widened submit_site_log_entry to accept owner/manager
    // callers too, so an entry can be authored by a contractor with NO
    // workers row at all — loggedByName() above already has to handle
    // this same distinction via its 'Contractant' fallback). Priority:
    // profiles.avatar_url (works for both a worker's own linked account
    // AND a contractor) first, workers.photo_url (worker-only) second —
    // same direction as every other identity render this phase touches.
    // Audit sweep (same root cause as 1a-1d) — this was a direct
    // `.from('profiles')` batch query, which profiles_select_own (0005,
    // `id = auth.uid()` only) silently reduces to zero rows for every
    // author but the caller. Uses get_org_member_profiles (0085) instead,
    // scoped to the current project's org.
    const distinctUserIds = Array.from(
      new Set(rows.map((l) => l.logged_by).filter((v): v is string => !!v)),
    );
    const logOrgId = projects.find((p) => p.id === projectId)?.lead_org_id ?? null;
    if (distinctUserIds.length > 0 && logOrgId) {
      const { data: allProfileRows } = await supabase.rpc('get_org_member_profiles', {
        p_org_id: logOrgId,
      });
      const profileRows = (allProfileRows ?? []).filter((p: { id: string }) =>
        distinctUserIds.includes(p.id),
      );
      const profileAvatarByUserId: Record<string, string> = {};
      for (const p of profileRows ?? [])
        if (p.avatar_url) profileAvatarByUserId[p.id] = p.avatar_url;

      const pathByUserId: Record<string, string> = {};
      for (const uid of distinctUserIds) {
        const path = profileAvatarByUserId[uid] || workerByUserId[uid]?.photo_url;
        if (path) pathByUserId[uid] = path;
      }
      const urlMap = await getSignedUrlMap(Object.values(pathByUserId));
      const authorMap: Record<string, string> = {};
      for (const [uid, path] of Object.entries(pathByUserId)) {
        if (urlMap[path]) authorMap[uid] = urlMap[path];
      }
      setAuthorPhotoUrlByUserId(authorMap);
    } else {
      setAuthorPhotoUrlByUserId({});
    }
  }

  const workerByUserId = useMemo(() => {
    const map: Record<string, Worker> = {};
    workers.forEach((w) => {
      if (w.user_id) map[w.user_id] = w;
    });
    return map;
  }, [workers]);

  function loggedByName(log: SiteLog): string {
    if (!log.logged_by) return 'Inconnu';
    return workerByUserId[log.logged_by]?.full_name ?? 'Contractant';
  }

  // Phase 6 §1.2 step 3 — same precedence the row list's own thumbnail-
  // vs-icon branch already uses (photo first, then voice, else text),
  // reused here instead of a second inference.
  function entryType(log: SiteLog): 'photo' | 'voice' | 'text' {
    if (log.photo_url) return 'photo';
    if (log.voice_note_url) return 'voice';
    return 'text';
  }

  // Phase 6 §1.2 step 4 — UX-only gate; see file header for why the real
  // boundary is the RPCs' own in-function check, not this.
  function canManageLog(log: SiteLog | null): boolean {
    if (!log || !userId) return false;
    return log.logged_by === userId || myOrgRole === 'owner' || myOrgRole === 'manager';
  }

  const detail = useMemo(() => logs.find((l) => l.id === detailId) ?? null, [logs, detailId]);

  async function openDetail(log: SiteLog) {
    setDetailId(log.id);
    setDetailPhotoUrl(null);
    setDetailVoiceUrl(null);
    setEditingCaption(false);
    if (log.photo_url) setDetailPhotoUrl(await getSignedUrl(log.photo_url));
    if (log.voice_note_url) setDetailVoiceUrl(await getSignedUrl(log.voice_note_url));
  }

  function startEditCaption() {
    if (!detail) return;
    setCaptionDraft(detail.caption ?? detail.note_text ?? '');
    setEditingCaption(true);
  }

  async function handleSaveCaption() {
    if (!detail) return;
    setSavingCaption(true);
    try {
      const { error } = await supabase.rpc('update_site_log_caption', {
        p_log_id: detail.id,
        p_caption: captionDraft.trim() || null,
      });
      if (error) throw error;
      haptics.confirm();
      toast.success('Légende mise à jour.');
      setEditingCaption(false);
      if (selectedProjectId) await loadLogs(selectedProjectId);
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de mettre à jour la légende.');
    } finally {
      setSavingCaption(false);
    }
  }

  // Phase 11 §9.2 — optimistic soft-delete + UndoToast, replacing the old
  // Alert.alert confirm. The RPC fires immediately (matching the "lower-
  // stakes delete" framing §9.2 gives this specific action); the row is
  // pulled out of `logs` right away so the list/detail sheet reflect the
  // delete instantly, and the toast's "Annuler" tap calls restore_site_log
  // to reverse both the server row and the local list entry. If the
  // window elapses unactioned, nothing further happens — the row stays
  // soft-deleted, exactly as journal's Phase-6-built RPC always intended.
  async function handleDeleteLog() {
    if (!detail) return;
    const logToDelete = detail;
    setDeletingLogId(logToDelete.id);
    try {
      const { error } = await supabase.rpc('soft_delete_site_log', { p_log_id: logToDelete.id });
      if (error) throw error;
      haptics.confirm();
      setLogs((prev) => prev.filter((l) => l.id !== logToDelete.id));
      setPendingDeleteLog(logToDelete);
      undoToast.show(logToDelete.id, 'Entrée supprimée.');
      setDetailId(null);
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? "Impossible de supprimer l'entrée.");
    } finally {
      setDeletingLogId(null);
    }
  }

  async function handleUndoDeleteLog() {
    if (!pendingDeleteLog) return;
    const restoredLog = pendingDeleteLog;
    try {
      const { error } = await supabase.rpc('restore_site_log', { p_log_id: restoredLog.id });
      if (error) throw error;
      haptics.confirm();
      toast.success('Entrée restaurée.');
      setPendingDeleteLog(null);
      undoToast.clear();
      if (selectedProjectId) await loadLogs(selectedProjectId);
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? "Impossible de restaurer l'entrée.");
    }
  }

  function handleDeleteLogExpired() {
    // Window elapsed unactioned — the row is already soft-deleted
    // server-side and already removed from `logs` locally; nothing further
    // to do beyond clearing the toast's own state.
    setPendingDeleteLog(null);
    undoToast.clear();
  }

  // Phase 6 §1.2 step 3 — distinct authors present in the CURRENT
  // project's logs, for the author filter chip row. Resolved through the
  // same loggedByName() every other author render in this file uses.
  const distinctAuthors = useMemo(() => {
    const seen = new Map<string, string>();
    logs.forEach((log) => {
      if (log.logged_by && !seen.has(log.logged_by)) {
        seen.set(log.logged_by, loggedByName(log));
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, workerByUserId]);

  // Phase 6 §1.2 step 3 — the filter row applies BEFORE date-grouping
  // below; grouping/labels are otherwise unaffected by filtering.
  // Phase 11 §9.1 — search applies alongside the existing three facets,
  // matching on caption/note_text OR the resolved author name, same
  // "already-fetched list, filtered client-side" approach projects.tsx's
  // own header comment documents.
  const filteredLogs = useMemo(() => {
    const today = todayISO();
    const weekStart = cycleStartISO();
    const monthStart = `${today.slice(0, 7)}-01`;
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterAuthor !== 'all' && log.logged_by !== filterAuthor) return false;
      if (filterType !== 'all' && entryType(log) !== filterType) return false;
      if (filterPeriod !== 'all') {
        const logDate = log.created_at.slice(0, 10);
        if (filterPeriod === 'today' && logDate !== today) return false;
        if (filterPeriod === 'week' && logDate < weekStart) return false;
        if (filterPeriod === 'month' && logDate < monthStart) return false;
      }
      if (q) {
        const haystack =
          `${log.caption ?? ''} ${log.note_text ?? ''} ${loggedByName(log)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, filterAuthor, filterType, filterPeriod, search, workerByUserId]);

  // Phase 2 §1.2 step 2 — group the already-desc-sorted, now-filtered
  // logs into Aujourd'hui / Hier / Cette semaine / Plus ancien buckets.
  // See file header for the "Plus ancien" judgment call.
  const groupedLogs = useMemo(() => {
    const today = todayISO();
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const weekStart = cycleStartISO();

    const buckets: { today: SiteLog[]; yesterday: SiteLog[]; week: SiteLog[]; older: SiteLog[] } = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };

    filteredLogs.forEach((log) => {
      const logDate = log.created_at.slice(0, 10);
      if (logDate === today) buckets.today.push(log);
      else if (logDate === yesterday) buckets.yesterday.push(log);
      else if (logDate >= weekStart) buckets.week.push(log);
      else buckets.older.push(log);
    });

    return [
      { label: "Aujourd'hui", entries: buckets.today },
      { label: 'Hier', entries: buckets.yesterday },
      { label: 'Cette semaine', entries: buckets.week },
      { label: 'Plus ancien', entries: buckets.older },
    ].filter((bucket) => bucket.entries.length > 0);
  }, [filteredLogs]);

  // Phase 6 §1.2 step 6 — grid mode shows only photo-bearing entries from
  // the already-filtered set. See file header for why voice/text aren't
  // shown as placeholder tiles.
  const gridPhotoLogs = useMemo(
    () => filteredLogs.filter((log) => !!log.photo_url),
    [filteredLogs],
  );
  const gridHiddenCount = filteredLogs.length - gridPhotoLogs.length;

  function handleEntrySubmitted() {
    setAddOpen(false);
    toast.success('Entrée ajoutée au journal.');
    if (selectedProjectId) void loadLogs(selectedProjectId);
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonTimeline rows={4} />
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

  if (projects.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={ImageIcon}
          icon3d="no-data"
          title="Aucun chantier"
          description="Créez d'abord un chantier pour voir son journal de bord."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        {deepLinkProjectId ? (
          <XStack alignItems="center" gap="$3" marginBottom="$4">
            <XStack
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <ArrowLeftIcon size={20} />
            </XStack>
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              Journal de chantier
            </Text>
          </XStack>
        ) : (
          <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
            Journal de chantier
          </Text>
        )}

        {!deepLinkProjectId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            <XStack gap="$2">
              {projects.map((p) => {
                const active = p.id === selectedProjectId;
                return (
                  <XStack
                    key={p.id}
                    paddingVertical={8}
                    paddingHorizontal={14}
                    borderRadius={999}
                    backgroundColor={active ? '$accent600' : '$neutral0'}
                    borderWidth={1}
                    borderColor={active ? '$accent600' : '$neutral300'}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text fontSize={13.5} fontWeight="500" color={active ? 'white' : '$neutral900'}>
                      {p.name}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>
          </ScrollView>
        )}

        {logs.length > 0 && (
          <YStack gap="$2" marginBottom="$3">
            {/* Phase 11 §9.1 — search field, above the filter chip rows.
                Client-side over the already-fetched `logs` list (see file
                header). */}
            {/* UI/UX pass — on SearchFilterBar for the same fixed-height
                treatment as every other list screen's search field. */}
            <SearchFilterBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher une entrée ou un auteur"
            />

            {/* Phase 6 §1.2 step 3 — three compact chip rows (Auteur /
                Type / Période). See file header for why three rows
                instead of one combined row or a full filter sheet. */}
            {distinctAuthors.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack gap="$1.5" alignItems="center">
                  <Text fontSize={11.5} color="$neutral500" marginEnd={2}>
                    Auteur
                  </Text>
                  <FilterChip
                    label="Tous"
                    active={filterAuthor === 'all'}
                    onPress={() => setFilterAuthor('all')}
                  />
                  {distinctAuthors.map((a) => (
                    <FilterChip
                      key={a.id}
                      label={a.name}
                      active={filterAuthor === a.id}
                      onPress={() => setFilterAuthor(a.id)}
                    />
                  ))}
                </XStack>
              </ScrollView>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$1.5" alignItems="center">
                <Text fontSize={11.5} color="$neutral500" marginEnd={2}>
                  Type
                </Text>
                <FilterChip
                  label="Tous"
                  active={filterType === 'all'}
                  onPress={() => setFilterType('all')}
                />
                <FilterChip
                  label="Photo"
                  active={filterType === 'photo'}
                  onPress={() => setFilterType('photo')}
                />
                <FilterChip
                  label="Voix"
                  active={filterType === 'voice'}
                  onPress={() => setFilterType('voice')}
                />
                <FilterChip
                  label="Texte"
                  active={filterType === 'text'}
                  onPress={() => setFilterType('text')}
                />
              </XStack>
            </ScrollView>
            <XStack justifyContent="space-between" alignItems="center">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack gap="$1.5" alignItems="center">
                  <Text fontSize={11.5} color="$neutral500" marginEnd={2}>
                    Période
                  </Text>
                  <FilterChip
                    label="Tout"
                    active={filterPeriod === 'all'}
                    onPress={() => setFilterPeriod('all')}
                  />
                  <FilterChip
                    label="Aujourd'hui"
                    active={filterPeriod === 'today'}
                    onPress={() => setFilterPeriod('today')}
                  />
                  <FilterChip
                    label="Cette semaine"
                    active={filterPeriod === 'week'}
                    onPress={() => setFilterPeriod('week')}
                  />
                  <FilterChip
                    label="Ce mois"
                    active={filterPeriod === 'month'}
                    onPress={() => setFilterPeriod('month')}
                  />
                </XStack>
              </ScrollView>
              {/* Phase 6 §1.2 step 6 — list/grid toggle. */}
              <XStack
                backgroundColor="$neutral100"
                borderRadius="$control"
                padding={2}
                gap={2}
                marginStart="$2"
              >
                <XStack
                  padding={7}
                  borderRadius={9}
                  backgroundColor={viewMode === 'list' ? '$neutral0' : 'transparent'}
                  onPress={() => setViewMode('list')}
                  accessibilityRole="button"
                  accessibilityLabel="Vue liste"
                >
                  <ListIcon size={16} color={viewMode === 'list' ? color.accent[600] : '#8A8F98'} />
                </XStack>
                <XStack
                  padding={7}
                  borderRadius={9}
                  backgroundColor={viewMode === 'grid' ? '$neutral0' : 'transparent'}
                  onPress={() => setViewMode('grid')}
                  accessibilityRole="button"
                  accessibilityLabel="Vue grille"
                >
                  <GridFourIcon
                    size={16}
                    color={viewMode === 'grid' ? color.accent[600] : '#8A8F98'}
                  />
                </XStack>
              </XStack>
            </XStack>
          </YStack>
        )}

        {logs.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune entrée pour ce chantier.
          </Text>
        ) : filteredLogs.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune entrée ne correspond à ces filtres.
          </Text>
        ) : viewMode === 'grid' ? (
          <YStack gap="$2">
            {gridHiddenCount > 0 && (
              <Text fontSize={12} color="$neutral500">
                {gridHiddenCount} entrée(s) audio/texte non affichée(s) en mode grille — passez en
                vue liste pour les voir.
              </Text>
            )}
            <XStack flexWrap="wrap" gap="$1.5">
              {gridPhotoLogs.map((log) => (
                <XStack
                  key={log.id}
                  width="31.5%"
                  aspectRatio={1}
                  borderRadius={10}
                  overflow="hidden"
                  backgroundColor="$neutral100"
                  onPress={() => openDetail(log)}
                >
                  {thumbUrls[log.id] && (
                    <Image source={{ uri: thumbUrls[log.id]! }} width="100%" height="100%" />
                  )}
                </XStack>
              ))}
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$5">
            {groupedLogs.map((bucket) => (
              <YStack key={bucket.label} gap="$2.5">
                <Text
                  fontSize={13}
                  fontWeight="600"
                  color="$neutral500"
                  textTransform="uppercase"
                  letterSpacing={0.4}
                >
                  {bucket.label}
                </Text>

                {/* Timeline rail — a short line down the left edge of this
                    section only, with a dot per entry. Was one continuous
                    rail across the whole screen before date-grouping;
                    split per-section so each bucket reads as its own
                    connected sequence. */}
                <YStack position="relative">
                  <YStack
                    position="absolute"
                    left={7}
                    top={28}
                    bottom={28}
                    width={2}
                    backgroundColor="$neutral200"
                  />
                  <YStack gap="$3">
                    {bucket.entries.map((log) => (
                      <XStack key={log.id} alignItems="flex-start" gap="$3">
                        <YStack alignItems="center" width={16} paddingTop={26} zIndex={1}>
                          <YStack
                            width={10}
                            height={10}
                            borderRadius={5}
                            backgroundColor="$accent600"
                            borderWidth={2}
                            borderColor="$neutral25"
                          />
                        </YStack>
                        <XStack
                          flex={1}
                          backgroundColor="$neutral0"
                          borderRadius="$card"
                          padding="$3"
                          alignItems="center"
                          gap="$3"
                          onPress={() => openDetail(log)}
                        >
                          {thumbUrls[log.id] ? (
                            <Image
                              source={{ uri: thumbUrls[log.id]! }}
                              width={56}
                              height={56}
                              borderRadius={12}
                            />
                          ) : (
                            <YStack
                              width={56}
                              height={56}
                              borderRadius={12}
                              backgroundColor="$neutral100"
                              alignItems="center"
                              justifyContent="center"
                            >
                              {log.voice_note_url ? (
                                <MicrophoneIcon size={22} color="#8A8F98" />
                              ) : (
                                <NoteIcon size={22} color="#8A8F98" />
                              )}
                            </YStack>
                          )}
                          <YStack flex={1} gap="$1">
                            <Text fontSize={14.5} numberOfLines={2}>
                              {log.note_text || log.caption || 'Photo de chantier'}
                            </Text>
                            <XStack alignItems="center" gap="$1.5">
                              <Avatar
                                name={loggedByName(log)}
                                imageUrl={
                                  log.logged_by ? authorPhotoUrlByUserId[log.logged_by] : undefined
                                }
                                size={16}
                              />
                              <Text fontSize={12} color="$neutral500">
                                {loggedByName(log)} ·{' '}
                                {new Date(log.created_at).toLocaleDateString('fr-TN')}
                              </Text>
                              {log.location_lat != null && <MapPinIcon size={13} color="#8A8F98" />}
                            </XStack>
                          </YStack>
                        </XStack>
                      </XStack>
                    ))}
                  </YStack>
                </YStack>
              </YStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      {/* Phase 2 §1.2 step 1 — contractor add-entry FAB. Only rendered once
          a project is actually selected (same guard as the empty-state
          return above: `projects.length === 0` already exits before this
          point, so `selectedProjectId` is set by the time we get here on
          every render except the very first frame after `load()`
          resolves, which `loading` already covers). */}
      {selectedProjectId && orgId && userId && (
        <FAB
          icon={PlusIcon}
          accessibilityLabel="Ajouter une entrée"
          onPress={() => setAddOpen(true)}
        />
      )}

      {selectedProjectId && orgId && userId && (
        <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Ajouter une entrée">
          <SiteLogForm
            orgId={orgId}
            projectId={selectedProjectId}
            userId={userId}
            onSubmitted={handleEntrySubmitted}
          />
        </Sheet>
      )}

      <Sheet
        visible={Boolean(detail)}
        onClose={() => {
          setDetailId(null);
          setFullScreenPhoto(false);
        }}
        title="Détail"
      >
        {detail && (
          <YStack gap="$3">
            {/* Phase 6 §1.2 step 4 — edit/delete actions, visible only to
                the entry's own author or an org owner/manager. Placed at
                the top of the sheet body rather than in Sheet's title
                (a plain string prop) — Sheet.tsx itself is untouched. */}
            {canManageLog(detail) && !editingCaption && (
              <XStack gap="$3" justifyContent="flex-end">
                <Button
                  variant="chip"
                  fullWidth={false}
                  icon={PencilSimpleIcon}
                  onPress={startEditCaption}
                  accessibilityLabel="Modifier la légende"
                >
                  Modifier
                </Button>
                <XStack
                  alignItems="center"
                  gap={4}
                  onPress={handleDeleteLog}
                  opacity={deletingLogId === detail.id ? 0.5 : 1}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer l'entrée"
                >
                  <TrashIcon size={16} color={color.status.danger} />
                  <Text fontSize={13} color="$danger" fontWeight="500">
                    Supprimer
                  </Text>
                </XStack>
              </XStack>
            )}

            {detailPhotoUrl && (
              <Image
                source={{ uri: detailPhotoUrl }}
                width="100%"
                height={240}
                borderRadius={16}
                resizeMode="cover"
                onPress={() => setFullScreenPhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Agrandir la photo"
              />
            )}

            {/* Phase 6 §1.2 step 5 — Play/Pause + scrub-able progress bar,
                replacing the old play-only row. See file header for the
                expo-audio API confirmation. */}
            {detailVoiceUrl && (
              <YStack gap="$2" backgroundColor="$neutral25" borderRadius="$control" padding="$3">
                <XStack alignItems="center" gap="$3">
                  <XStack
                    onPress={() => (playerStatus.playing ? player?.pause?.() : player?.play?.())}
                    accessibilityRole="button"
                    accessibilityLabel={playerStatus.playing ? 'Pause' : 'Écouter la note vocale'}
                  >
                    {playerStatus.playing ? (
                      <PauseIcon size={22} color="#111318" />
                    ) : (
                      <PlayIcon size={22} color="#111318" />
                    )}
                  </XStack>
                  <YStack flex={1} gap={4}>
                    <XStack
                      height={4}
                      borderRadius={2}
                      backgroundColor="$neutral200"
                      overflow="hidden"
                      onLayout={(e: any) => setProgressBarWidth(e.nativeEvent.layout.width)}
                      onPress={(e: any) => {
                        if (!playerStatus.duration || !progressBarWidth) return;
                        const x = e?.nativeEvent?.locationX ?? 0;
                        const ratio = Math.min(1, Math.max(0, x / progressBarWidth));
                        player?.seekTo?.(ratio * playerStatus.duration);
                      }}
                    >
                      <XStack
                        height={4}
                        backgroundColor="$accent600"
                        width={
                          playerStatus.duration
                            ? `${Math.min(100, (playerStatus.currentTime / playerStatus.duration) * 100)}%`
                            : '0%'
                        }
                      />
                    </XStack>
                    <Text fontSize={11.5} color="$neutral500">
                      {formatSeconds(playerStatus.currentTime)} /{' '}
                      {formatSeconds(playerStatus.duration)}
                    </Text>
                  </YStack>
                </XStack>
              </YStack>
            )}

            {/* Phase 6 §1.2 step 4 — inline caption editor, shown instead
                of the static caption/note text when editing. See file
                header for why this is a small dedicated editor rather
                than a reused SiteLogForm. */}
            {editingCaption ? (
              <YStack gap="$2">
                <FormField
                  label="Légende"
                  value={captionDraft}
                  onChangeText={setCaptionDraft}
                  multiline
                  placeholder="Décrire cette entrée…"
                />
                <XStack gap="$2">
                  <Button variant="secondary" flex={1} onPress={() => setEditingCaption(false)}>
                    Annuler
                  </Button>
                  <Button flex={1} onPress={handleSaveCaption} loading={savingCaption}>
                    Enregistrer
                  </Button>
                </XStack>
              </YStack>
            ) : (
              (detail.note_text || detail.caption) && (
                <Text fontSize={14.5}>{detail.note_text || detail.caption}</Text>
              )
            )}

            <YStack gap="$1">
              <Text fontSize={13} color="$neutral500">
                Ajouté par {loggedByName(detail)}
              </Text>
              <Text fontSize={13} color="$neutral500">
                {new Date(detail.created_at).toLocaleString('fr-TN')}
              </Text>
              {detail.location_lat != null &&
                detail.location_lng != null &&
                (() => {
                  const mapUrl = staticMapUrl(detail.location_lat, detail.location_lng);
                  return (
                    <YStack gap="$1.5">
                      {/* IMPROVEMENT-PLAN Part D2 — the coordinates were
                        already captured and stored; this is the "shown
                        visually" half that never existed. Falls back to
                        exactly today's text-only row (nothing below this
                        block changes) when no Static Maps key is
                        configured — see staticMap.ts. */}
                      {mapUrl && (
                        <Image
                          source={{ uri: mapUrl }}
                          width="100%"
                          height={160}
                          borderRadius={12}
                          resizeMode="cover"
                        />
                      )}
                      <XStack alignItems="center" gap="$1.5">
                        <MapPinIcon size={13} color="#8A8F98" />
                        <Text fontSize={13} color="$neutral500">
                          {detail.location_lat.toFixed(5)}, {detail.location_lng.toFixed(5)}
                        </Text>
                      </XStack>
                    </YStack>
                  );
                })()}
            </YStack>
          </YStack>
        )}
      </Sheet>

      <ImageViewer
        visible={fullScreenPhoto}
        uri={detailPhotoUrl}
        onClose={() => setFullScreenPhoto(false)}
      />

      {/* Phase 11 §9.2 — undo-toast for the delete flow above. */}
      <UndoToast
        visible={!!undoToast.pending}
        message={undoToast.pending?.message ?? ''}
        onUndo={handleUndoDeleteLog}
        onExpire={handleDeleteLogExpired}
      />
    </YStack>
  );
}

/**
 * Phase 6 §1.2 step 3 — small chip used by all three filter rows above.
 * Same pill visual as the project picker chips earlier in this file
 * (padding/radius/border/active-color), factored out here since it's now
 * repeated 4x (author, type, period, plus the project picker itself keeps
 * its own inline copy since it's a slightly different one-off row).
 */
function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <XStack
      paddingVertical={6}
      paddingHorizontal={12}
      borderRadius={999}
      backgroundColor={active ? '$accent600' : '$neutral0'}
      borderWidth={1}
      borderColor={active ? '$accent600' : '$neutral300'}
      onPress={onPress}
    >
      <Text fontSize={12.5} fontWeight="500" color={active ? 'white' : '$neutral900'}>
        {label}
      </Text>
    </XStack>
  );
}

/**
 * Phase 6 §1.2 step 5 — mm:ss formatting for the voice-note progress bar.
 * `expo-audio`'s `currentTime`/`duration` are both seconds (confirmed
 * against the installed 0.4.9 package's own AudioStatus type before
 * using them), never NaN/undefined once the player is constructed, but
 * `duration` is briefly 0 before the file finishes loading — guarded
 * below so the label reads "0:00" instead of "NaN:NaN" for that first frame.
 */
function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

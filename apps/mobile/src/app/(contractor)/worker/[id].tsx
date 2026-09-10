import { color } from '@dala/design-tokens';
import type {
  Advance,
  DispatchAssignment,
  Project,
  ProfileSummary,
  Worker,
  WorkerLatenessPattern,
} from '@dala/shared-types';
import { updateWorkerProfileSchema } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  CameraIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  HandCoinsIcon,
  XCircleIcon,
} from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { AttendanceHistory } from '@/components/attendance/AttendanceHistory';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { WorkerHubTabs } from '@/components/worker/WorkerHubTabs';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processAvatarPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { tradeIcon } from '@/lib/tradeIcon';

/**
 * apps/mobile/src/app/(contractor)/worker/[id].tsx
 *
 * NEW in Phase 5 — the first dynamic route (`worker/[id]`) anywhere in this
 * mobile app; no prior screen (team.tsx, projects.tsx) established this
 * expo-router convention, so this file is also the precedent for any future
 * detail screen (e.g. project detail, still unbuilt as of this phase).
 *
 * SCOPE CALL (flagged, not silently decided): Doc 02 §2.2/§2.9 says Tier 0
 * dispatch-lateness patterns are "now actually shown to the contractor on
 * the Worker Detail screen" — that screen didn't exist at all before this
 * file. Rather than building the full worker-management hub Doc 03 never
 * actually specifies in detail (edit worker, attendance history, advance
 * history, documents — none of that is written anywhere for mobile), this
 * is deliberately scoped to exactly what Phase 5 needs: identity header +
 * the Tier 0 pattern card. A fuller Worker Detail (edit, history tabs) is
 * future work, not invented here to look more finished than the spec
 * actually asks for.
 *
 * DEFENSE-IN-DEPTH FILTER — added Phase 15 (Doc 00 §0.5 #29's own flagged
 * follow-up): this screen originally queried `active_workers` by `.eq('id',
 * id)` alone, unlike every other caller of that view (team.tsx,
 * project-roster.tsx, generate-report), which all defensively filter by
 * `.eq('org_id', orgId)` too. Migration 0037 (`security_invoker = true`)
 * already closes the actual exposure at the schema level — RLS now runs as
 * the querying user regardless of this screen's own filter, so a worker id
 * from another org correctly resolves to nothing even without the change
 * below. This is belt-and-suspenders, not the fix itself: mirrors
 * team.tsx's exact `.eq('org_id', ...)` pattern, sourcing `orgId` from
 * `getActiveOrgId()` the same way, so this screen no longer stands out as
 * the one caller relying solely on the schema-level guarantee.
 *
 * IMPROVEMENT-PLAN PHASE 3 (§1.5, §4.1) — this is the screen a contractor
 * reaches by tapping a worker row in team.tsx, so it's where "a contractor
 * set it from team.tsx" (§1.5's own wording) is implemented: tapping the
 * new avatar circle in the identity header opens the camera/library
 * picker (same two-button pattern as SiteLogForm/profile-settings.tsx),
 * processes through `processAvatarPhoto` (square 512×512 identity crop —
 * same function profile-settings.tsx already uses for a person's own
 * avatar; NOT the general `processPhoto` vehicles.tsx/expenses.tsx use,
 * since this IS an identity photo), and writes straight to
 * `workers.photo_url` (already owner/manager-writable — no new RLS).
 *
 * JUDGMENT CALL — the §1.5/§4.1 overlap flagged in docs/PHASE_3_BRIEF.md's
 * "Photo resolution" section: this header displays `profiles.avatar_url`
 * (via the worker's linked account, once `user_id` is set) IN PREFERENCE
 * to `workers.photo_url`, falling back to the latter when no linked
 * profile photo exists — a worker's own self-chosen photo, once they've
 * accepted their invite and set one, should be what's shown everywhere,
 * with the contractor-set photo acting as a placeholder/pre-invite
 * default rather than a permanent override. See the brief for the full
 * reasoning.
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.6) — this is that "future work," now done:
 * the screen is rebuilt as a 4-tab hub (Infos/Pointage/Avances/Dispatch).
 * The Infos tab below is EXACTLY what this file already rendered before
 * this phase (identity header, photo picker, lateness-pattern card) —
 * unchanged, just wrapped in a tab body instead of being the whole
 * screen; `handlePickPhoto`/`processAvatarPhoto`/the avatar-priority
 * resolution in `load()` are all untouched, per this phase's own
 * instruction not to disturb them.
 *
 * Pointage tab reuses `AttendanceHistory` (built for §1.1 step 2) with
 * `workerId`/`lockToWorker` — this IS the plan's own "per-worker mode,"
 * not a second implementation.
 *
 * Avances/Dispatch tabs are READ-ONLY history lists — a disclosed,
 * plan-sanctioned scope cut (§1.6: "a read-only history list is a fine,
 * honest cut to make and disclose" when a write-side extraction isn't
 * low-effort). Both `advances.tsx` and `dispatch.tsx` mix genuinely
 * screen-level concerns into their write paths that don't decompose
 * cleanly into a single-worker tab: `advances.tsx`'s create-advance flow
 * is wired to THIS SCREEN'S OWN payroll-cycle summary card (cycle
 * totals, days-worked-this-cycle, the whole point of that screen), and
 * `dispatch.tsx`'s assignment editor is wired to vehicle assignment,
 * per-project bulk dispatch, and departure-confirmation flows that only
 * make sense from the all-workers dispatch board, not a single worker's
 * card. Dragging either whole screen's state into a tab body would be
 * exactly the "copy-paste whole screens" anti-pattern this phase's own
 * instructions warn against. The read queries below ARE extracted/
 * filtered reuse of each screen's own query shape (`advances` /
 * `dispatch_assignments`, both already indexed by `worker_id` —
 * `dispatch_assignments_worker_id_date_idx`, confirmed by reading 0006 —
 * so this is genuinely cheap, not a new access pattern).
 *
 * Tab state is local `useState`, reset to 'infos' on every focus (see the
 * `useFocusEffect` below) — not deep-linked/URL-persisted, matching this
 * app's existing convention for resettable multi-state screens
 * (pointage.tsx's `hasSeededRef`, journal.tsx's project picker).
 */
const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function WorkerDetailScreen() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [patterns, setPatterns] = useState<WorkerLatenessPattern[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — distinguishes "the fetch failed" from "this
  // worker genuinely doesn't exist" (previously both showed
  // "Travailleur introuvable"). Scoped to the three data-bearing
  // queries (worker, advances, dispatch assignments) — the lateness
  // RPC below is supplementary analytics, not gated on.
  const [loadError, setLoadError] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Phase 3 §1.5/§4.1 — resolved display photo, preferring the linked
  // profiles.avatar_url over workers.photo_url (see this file's own
  // header for the fallback-direction reasoning). Both are storage paths;
  // this holds the freshly-minted signed URL for whichever one applies.
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Phase 10 §4.3 — job_title/hire_date, contractor-set (workers table,
  // not profiles — see migration 0075's own column comments for why).
  const [jobTitle, setJobTitle] = useState('');
  const [hireDate, setHireDate] = useState<string | null>(null);
  const [savingWorkerProfile, setSavingWorkerProfile] = useState(false);

  // Phase 10 §4.3 — cross-user profile read, only populated once the
  // worker has a linked account (user_id set). Uses
  // get_profile_summary_for_org_member (migration 0075, Part 5) — the
  // exact "manager viewing a worker's profile" case that RPC exists for.
  const [linkedProfile, setLinkedProfile] = useState<ProfileSummary | null>(null);

  // Phase 6 §1.6 — hub tab state, reset to 'infos' on every focus (see
  // useFocusEffect below), never URL-persisted.
  const [activeTab, setActiveTab] = useState<'infos' | 'pointage' | 'avances' | 'dispatch'>(
    'infos',
  );
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [assignments, setAssignments] = useState<DispatchAssignment[]>([]);
  const [projectNameById, setProjectNameById] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      setActiveTab('infos');
      void load();
    }, [id]),
  );

  async function load() {
    if (!id) return;
    setLoading(true);
    setLoadError(false);

    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setWorker(null);
      setPatterns([]);
      setAdvances([]);
      setAssignments([]);
      setLoading(false);
      return;
    }

    const [
      { data: workerRow, error: workerError },
      { data: latenessRows },
      { data: advanceRows, error: advancesError },
      { data: assignmentRows, error: assignmentsError },
    ] = await Promise.all([
      supabase.from('active_workers').select('*').eq('id', id).eq('org_id', org).maybeSingle(),
      supabase.rpc('get_worker_lateness_pattern', { p_worker_id: id }),
      // Phase 6 §1.6 — Avances tab: same `advances` shape advances.tsx
      // itself queries, filtered to this worker, read-only.
      supabase
        .from('advances')
        .select('*')
        .eq('org_id', org)
        .eq('worker_id', id)
        .order('created_at', { ascending: false }),
      // Phase 6 §1.6 — Dispatch tab: same `dispatch_assignments` shape
      // dispatch.tsx itself queries, filtered to this worker, read-only.
      // Uses `dispatch_assignments_worker_id_date_idx` (0006).
      supabase
        .from('dispatch_assignments')
        .select('*')
        .eq('org_id', org)
        .eq('worker_id', id)
        .order('assignment_date', { ascending: false })
        .limit(60),
    ]);

    if (workerError || advancesError || assignmentsError) {
      setLoadError(true);
      setLoading(false);
      return;
    }

    setWorker(workerRow ?? null);
    setJobTitle(workerRow?.job_title ?? '');
    setHireDate(workerRow?.hire_date ?? null);
    setAdvances((advanceRows as Advance[] | null) ?? []);
    setAssignments((assignmentRows as DispatchAssignment[] | null) ?? []);

    const projectIds = Array.from(
      new Set(
        ((assignmentRows as DispatchAssignment[] | null) ?? [])
          .map((a) => a.project_id)
          .filter(Boolean),
      ),
    ) as string[];
    if (projectIds.length > 0) {
      const { data: projectRows } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', projectIds);
      const map: Record<string, string> = {};
      ((projectRows as Pick<Project, 'id' | 'name'>[] | null) ?? []).forEach((p) => {
        map[p.id] = p.name;
      });
      setProjectNameById(map);
    } else {
      setProjectNameById({});
    }

    // Resolve the display photo: linked profile's own avatar_url first
    // (a worker who has accepted their invite and set their own photo via
    // worker settings), falling back to workers.photo_url (contractor-set,
    // works even pre-invite-acceptance since it needs no linked account).
    //
    // Audit fix 1d — this used to also run a direct
    // `.from('profiles').select('avatar_url').eq('id', workerRow.user_id)`
    // query, which is exactly the profiles_select_own (0005, `id =
    // auth.uid()` only) gap and so never returned a row for anyone but
    // the caller — meaning this priority fallback silently never applied
    // for any worker other than yourself. get_profile_summary_for_org_member
    // (called right below, and already org-scoped via security definer)
    // already returns avatar_url in its jsonb response, so the broken
    // direct query is just deleted rather than replaced.
    let resolvedPath: string | null = workerRow?.photo_url ?? null;
    if (workerRow?.user_id) {
      // Phase 10 §4.3 — the exact "manager viewing a worker's profile"
      // case get_profile_summary_for_org_member exists for. Only called
      // when the worker actually has a linked account; a not-yet-accepted
      // worker has no profiles row for this RPC to return anything about.
      const { data: summary } = await supabase.rpc('get_profile_summary_for_org_member', {
        p_user_id: workerRow.user_id,
      });
      const linkedSummary = (summary as ProfileSummary | null) ?? null;
      setLinkedProfile(linkedSummary);
      if (linkedSummary?.avatar_url) resolvedPath = linkedSummary.avatar_url;
    } else {
      setLinkedProfile(null);
    }
    setAvatarSignedUrl(resolvedPath ? await getSignedUrl(resolvedPath) : null);
    setPatterns((latenessRows as WorkerLatenessPattern[] | null) ?? []);
    setLoading(false);
  }

  async function handleSaveWorkerProfile() {
    if (!worker) return;
    const parsed = updateWorkerProfileSchema.safeParse({
      job_title: jobTitle.trim() || undefined,
      hire_date: hireDate ?? undefined,
    });
    if (!parsed.success) return;

    setSavingWorkerProfile(true);
    const { error } = await supabase
      .from('workers')
      .update({
        job_title: parsed.data.job_title ?? null,
        hire_date: parsed.data.hire_date ?? null,
      })
      .eq('id', worker.id);
    setSavingWorkerProfile(false);

    if (error) {
      toast.error("Impossible d'enregistrer ces informations.");
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Informations mises à jour.');
  }

  async function handlePickPhoto() {
    if (!worker || !orgId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error("Autorisez l'accès à vos photos pour changer la photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    try {
      const processedUri = await processAvatarPhoto(result.assets[0].uri);
      const path = await uploadOrgFile(orgId, 'workers', processedUri, 'jpg', 'image/jpeg');
      const { error } = await supabase
        .from('workers')
        .update({ photo_url: path })
        .eq('id', worker.id);
      if (error) throw error;

      // Only refreshes the display if the worker has no linked profile
      // photo taking priority (see load()'s resolution order above) —
      // set unconditionally here for immediate feedback; the next full
      // load() (on refocus) re-applies the real priority if a profile
      // photo exists.
      setAvatarSignedUrl(await getSignedUrl(path));
      setWorker({ ...worker, photo_url: path });
      haptics.confirm();
      toast.success('Photo mise à jour.');
    } catch {
      toast.error('Impossible de mettre à jour la photo.');
      haptics.error();
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
        <ErrorState onRetry={() => void load()} />
      </YStack>
    );
  }

  if (!worker) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" alignItems="center" justifyContent="center">
        <Text color="$neutral500">Travailleur introuvable.</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack
        alignItems="center"
        gap="$3"
        paddingTop={56}
        paddingHorizontal="$4"
        paddingBottom="$3"
      >
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={22} color={color.neutral[900]} />
        </XStack>
        <Text fontFamily="$display" fontSize={18} fontWeight="600">
          Fiche travailleur
        </Text>
      </XStack>

      {/* Phase 6 §1.6 — hub tab switcher. See WorkerHubTabs.tsx for why
          this is a small dedicated component, not a SegmentedControl reuse. */}
      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <WorkerHubTabs
          value={activeTab}
          onChange={(v) => setActiveTab(v as typeof activeTab)}
          tabs={[
            { value: 'infos', label: 'Infos' },
            { value: 'pointage', label: 'Pointage' },
            { value: 'avances', label: 'Avances' },
            { value: 'dispatch', label: 'Dispatch' },
          ]}
        />
      </YStack>

      {activeTab === 'infos' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
            <XStack alignItems="center" gap="$3">
              <View
                onPress={() => void handlePickPhoto()}
                accessibilityRole="button"
                accessibilityLabel="Changer la photo du travailleur"
              >
                <Avatar name={worker.full_name} imageUrl={avatarSignedUrl ?? undefined} size={64} />
                <View
                  position="absolute"
                  bottom={0}
                  right={0}
                  backgroundColor="$accent600"
                  borderRadius={999}
                  padding={5}
                >
                  <CameraIcon size={12} color={color.neutral[0]} />
                </View>
              </View>
              <YStack gap="$1" flex={1}>
                <Text fontFamily="$display" fontSize={20} fontWeight="600">
                  {worker.full_name}
                </Text>
                <XStack alignItems="center" gap="$1.5">
                  <Icon3D name={tradeIcon(worker.trade)} size={16} />
                  <Text fontSize={14} color="$neutral500">
                    {worker.trade ?? 'Métier non renseigné'}
                  </Text>
                </XStack>
                {uploadingPhoto && (
                  <Text fontSize={12} color="$neutral500">
                    Envoi de la photo…
                  </Text>
                )}
              </YStack>
            </XStack>
            <XStack gap="$2">
              {worker.phone && <StatusBadge variant="neutral">{worker.phone}</StatusBadge>}
              {worker.daily_rate != null && (
                <StatusBadge variant="info">{`${worker.daily_rate} TND/jour`}</StatusBadge>
              )}
            </XStack>
          </YStack>

          {/* Phase 10 §4.3 — job_title/hire_date, contractor-editable, plus
            (once the worker has a linked account) the email-verified/
            last-login signals read via get_profile_summary_for_org_member
            (migration 0075, Part 5) — the exact "manager viewing a
            worker's profile" case that RPC was built for. */}
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$3"
            marginTop="$3"
          >
            <Text fontSize={15.5} fontWeight="600">
              Poste
            </Text>
            <FormField
              label="Titre du poste"
              placeholder="ex. Chef de chantier"
              value={jobTitle}
              onChangeText={setJobTitle}
            />
            <DatePicker label="Date d'embauche" value={hireDate} onChange={setHireDate} />
            <Button
              variant="secondary"
              onPress={() => void handleSaveWorkerProfile()}
              loading={savingWorkerProfile}
            >
              Enregistrer
            </Button>

            {/* Only rendered once the worker has accepted their invite and
              linked an account — see load()'s own guard above. */}
            {linkedProfile && (
              <YStack gap="$1.5" paddingTop="$2" borderTopWidth={1} borderTopColor="$neutral100">
                <XStack alignItems="center" gap="$2">
                  {linkedProfile.email_verified_at ? (
                    <CheckCircleIcon size={15} color={color.status.success} weight="fill" />
                  ) : (
                    <XCircleIcon size={15} color={color.neutral[500]} />
                  )}
                  <Text fontSize={13} color="$neutral500">
                    {linkedProfile.email_verified_at ? 'E-mail vérifié' : 'E-mail non vérifié'}
                  </Text>
                </XStack>
                <Text fontSize={13} color="$neutral500">
                  Dernière connexion :{' '}
                  {linkedProfile.last_login_at
                    ? new Date(linkedProfile.last_login_at).toLocaleDateString('fr-TN')
                    : 'Non renseigné'}
                </Text>
              </YStack>
            )}
          </YStack>

          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$3"
            marginTop="$3"
          >
            <XStack alignItems="center" gap="$2">
              <ChartLineUpIcon size={18} color={color.accent[600]} weight="bold" />
              <Text fontSize={15.5} fontWeight="600">
                Habitudes de dispatch
              </Text>
            </XStack>

            {patterns.length === 0 ? (
              <Text fontSize={13} color="$neutral500">
                Pas encore assez de données de dispatch pour dégager une tendance fiable pour ce
                travailleur (au moins 4 trajets sur un même jour de la semaine sont nécessaires).
              </Text>
            ) : (
              <YStack gap="$2">
                <Text fontSize={13} color="$neutral500">
                  Retard moyen observé au départ, par jour de la semaine — calculé automatiquement à
                  partir de l&apos;historique de dispatch (Doc 02 §2.9, détection déterministe, sans
                  IA).
                </Text>
                {patterns.map((p) => (
                  <XStack
                    key={p.day_of_week}
                    justifyContent="space-between"
                    alignItems="center"
                    paddingVertical={6}
                    borderBottomWidth={1}
                    borderBottomColor="$neutral100"
                  >
                    <Text fontSize={14} color="$neutral900">
                      {DAY_LABELS[p.day_of_week]}
                    </Text>
                    <XStack gap="$2" alignItems="center">
                      <NumericText fontSize={14} fontWeight="600" color="$neutral900">
                        {p.avg_lateness_min > 0
                          ? `+${p.avg_lateness_min} min`
                          : `${p.avg_lateness_min} min`}
                      </NumericText>
                      <Text fontSize={12} color="$neutral500">
                        ({p.sample_count} trajets)
                      </Text>
                    </XStack>
                  </XStack>
                ))}
              </YStack>
            )}
          </YStack>
        </ScrollView>
      )}

      {/* Phase 6 §1.6 — Pointage tab: AttendanceHistory in its own
          per-worker mode, IS the plan's "per-worker mode" the history
          view (§1.1 step 2) was built to also support. */}
      {activeTab === 'pointage' && (
        <YStack flex={1} paddingHorizontal="$4" paddingTop="$3">
          <AttendanceHistory workerId={worker.id} lockToWorker />
        </YStack>
      )}

      {/* Phase 6 §1.6 — Avances tab, read-only (disclosed scope cut, see
          file header). Same status-color convention advances.tsx itself
          uses (approved=success, pending=neutral, rejected=danger). */}
      {activeTab === 'avances' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {advances.length === 0 ? (
            <EmptyState
              icon={HandCoinsIcon}
              illustration="mobile-payments"
              title="Aucune avance"
              description="Cet travailleur n'a aucune avance enregistrée."
            />
          ) : (
            <YStack gap="$2">
              {advances.map((a) => (
                <XStack
                  key={a.id}
                  backgroundColor="$neutral0"
                  borderRadius="$card"
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <YStack gap={2}>
                    <NumericText fontSize={15} fontWeight="600">
                      {Number(a.amount).toFixed(2)} TND
                    </NumericText>
                    <Text fontSize={12} color="$neutral500">
                      {new Date(a.created_at).toLocaleDateString('fr-TN')}
                      {a.reason ? ` · ${a.reason}` : ''}
                    </Text>
                  </YStack>
                  <StatusBadge
                    variant={
                      a.status === 'approved'
                        ? 'success'
                        : a.status === 'rejected'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {a.status === 'approved'
                      ? 'Approuvée'
                      : a.status === 'rejected'
                        ? 'Refusée'
                        : 'En attente'}
                  </StatusBadge>
                </XStack>
              ))}
            </YStack>
          )}
        </ScrollView>
      )}

      {/* Phase 6 §1.6 — Dispatch tab, read-only (disclosed scope cut, see
          file header). Shows the last 60 assignments for this worker. */}
      {activeTab === 'dispatch' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
          {assignments.length === 0 ? (
            <EmptyState
              icon={CalendarBlankIcon}
              illustration="team-assignment"
              title="Aucun dispatch"
              description="Cet travailleur n'a aucune affectation enregistrée."
            />
          ) : (
            <YStack gap="$2">
              {assignments.map((a) => (
                <XStack
                  key={a.id}
                  backgroundColor="$neutral0"
                  borderRadius="$card"
                  padding="$3"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <YStack gap={2} flex={1}>
                    <Text fontSize={14} fontWeight="600">
                      {a.project_id
                        ? (projectNameById[a.project_id] ?? 'Chantier')
                        : 'Chantier non renseigné'}
                    </Text>
                    <Text fontSize={12} color="$neutral500">
                      {new Date(`${a.assignment_date}T00:00:00`).toLocaleDateString('fr-TN')}
                      {a.departure_time ? ` · ${a.departure_time.slice(0, 5)}` : ''}
                    </Text>
                  </YStack>
                  {a.actual_departure_time ? (
                    <StatusBadge variant="success">Parti</StatusBadge>
                  ) : (
                    <StatusBadge variant="neutral">Prévu</StatusBadge>
                  )}
                </XStack>
              ))}
            </YStack>
          )}
        </ScrollView>
      )}
    </YStack>
  );
}

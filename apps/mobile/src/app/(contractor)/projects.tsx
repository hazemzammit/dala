import { color } from '@dala/design-tokens';
import type { Organization, Project } from '@dala/shared-types';
import { createProjectSchema, PROJECT_TYPES } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import {
  BuildingsIcon,
  CameraIcon,
  CaretRightIcon,
  FunnelIcon,
  ImageIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SquaresFourIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, TextInput, View as RNView } from 'react-native';
import { Image, Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Grid } from '@/components/ui/Grid';
import { NumericText } from '@/components/ui/NumericText';
import { Popover } from '@/components/ui/Popover';
import { ProgressBar } from '@/components/ui/Progress';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { Slider } from '@/components/ui/Slider';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, getSignedUrlMap, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/projects.tsx
 *
 * Phase 7 — Doc 03 §3.10.1 (list) and §3.10.3 (create/edit). Replaces the
 * Phase-0/1 empty-state stub that carried through Phases 4/5/6 unbuilt
 * (confirmed by reading it before writing this file). This also gives
 * Trash (Doc 01 §1.16) its first mobile entry point for soft-deleting a
 * project — before this phase, `soft_delete_project` (migration 0013) had
 * no caller anywhere in mobile.
 *
 * SCOPE NOTES, stated plainly rather than silently built around:
 *   - Doc 03 §3.10.2 "Project detail" describes a tab-bar hub (Aperçu /
 *     Dispatch / Dépenses / Matériaux / Journal / Sécurité / Équipe).
 *     Phase 10 adds project/[id].tsx, a real hub — but only Aperçu,
 *     Dépenses, and Journal are wired as genuine pre-filtered tabs this
 *     phase (expenses.tsx and journal.tsx now accept a project_id
 *     deep-link param and lock to it). Dispatch, Matériaux, and Sécurité
 *     are listed in the hub's "Autres modules" section as plain links —
 *     honestly unfiltered, landing on each screen's own picker, same as
 *     before — rather than claimed as deep-linked when they aren't.
 *     Retrofitting those three (and Équipe) is real remaining work, not
 *     done here. Tapping a project card now opens the hub directly;
 *     long-pressing still opens this file's lightweight sheet, trimmed
 *     down to just Modifier/Supprimer now that quick-access links live
 *     in the hub instead.
 *   - Progress % / progress ring (mentioned in §3.10.1/§3.10.2) has no
 *     backing data model anywhere in this schema (no milestones/tasks
 *     table, confirmed by grepping every migration) — building actual
 *     progress tracking is new speculative ground, exactly what this
 *     phase was scoped to avoid. Only the budget-consumed bar (real,
 *     computable from project_expenses) is shown, and only on the
 *     Dépenses tab / this list — deliberately not duplicated into the
 *     hub's header, which stays name/client/address/type only.
 *   - Search (§3.10.1) filters client-side over the already-fetched list
 *     rather than calling the `search_rpc` (migration 0012) — simpler,
 *     and fine at the list sizes one org actually has.
 *   - UI/UX pass: "Date de début" was previously a plain AAAA-MM-JJ text
 *     field (the scope-note that used to live here explained why — no
 *     native date-picker dependency existed anywhere in the repo). That's
 *     no longer true: `@react-native-community/datetimepicker` was added
 *     for `TimeInput.tsx`, and this field now uses the new `DatePicker`
 *     wrapper built on it. Same pass added the list/grid view toggle
 *     (`Grid.tsx`) and pull-to-refresh, both previously absent.
 */

interface ProjectRow extends Project {
  isLead: boolean;
  leadOrgName: string | null;
  consumedTotal: number;
}

type FilterKey = 'tous' | 'actifs' | 'termines' | 'invites';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'actifs', label: 'Actifs' },
  { key: 'termines', label: 'Terminés' },
  { key: 'invites', label: 'Invités' },
];

const PROJECT_TYPE_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  residentiel: 'Résidentiel',
  commercial: 'Commercial',
  industriel: 'Industriel',
  renovation: 'Rénovation',
  infrastructure: 'Infrastructure',
  autre: 'Autre',
};

interface ProjectFormState {
  name: string;
  client_name: string;
  address: string;
  start_date: string;
  budget_total: string;
  project_type: (typeof PROJECT_TYPES)[number] | '';
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  client_name: '',
  address: '',
  start_date: '',
  budget_total: '',
  project_type: '',
};

export default function ProjectsScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>('tous');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [orgRole, setOrgRole] = useState<'owner' | 'manager' | 'viewer' | null>(null);
  // Budget-consumed threshold filter — first real call site for both
  // Popover and Slider.
  const [minConsumedFilter, setMinConsumedFilter] = useState(0);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const filterAnchorRef = useRef<RNView | null>(null);

  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);
  // Phase 27 — themed ConfirmDialog replacing Alert.alert's destructive
  // two-button variant for "Supprimer ce chantier ?".
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Phase 3 §1.5 — cover-photo state, same upload-on-save-not-on-pick
  // pattern as vehicles.tsx/expenses.tsx. coverPath is the storage path
  // (existing on edit, or freshly uploaded on save); coverLocalUri is a
  // local preview of a newly-picked-but-not-yet-uploaded photo.
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [coverLocalUri, setCoverLocalUri] = useState<string | null>(null);
  const [coverSignedUrl, setCoverSignedUrl] = useState<string | null>(null);
  const [processingCover, setProcessingCover] = useState(false);
  const [cardPhotoUrlByPath, setCardPhotoUrlByPath] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setProjects([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const role = await getMyOrgRole(orgId);
    setOrgRole(role);

    const { data: leadProjects } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', orgId)
      .is('deleted_at', null);

    const { data: membershipRows } = await supabase
      .from('project_memberships')
      .select('project_id')
      .eq('org_id', orgId);

    const memberProjectIds = (membershipRows ?? []).map((r) => r.project_id);
    let memberProjects: Project[] = [];
    if (memberProjectIds.length > 0) {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .in('id', memberProjectIds)
        .is('deleted_at', null);
      memberProjects = data ?? [];
    }

    const leadOrgIds = [...new Set(memberProjects.map((p) => p.lead_org_id))];
    let orgNameById: Record<string, string> = {};
    if (leadOrgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', leadOrgIds);
      orgNameById = Object.fromEntries(
        ((orgs as Pick<Organization, 'id' | 'name'>[]) ?? []).map((o) => [o.id, o.name]),
      );
    }

    const allIds = [...(leadProjects ?? []).map((p) => p.id), ...memberProjects.map((p) => p.id)];
    let consumedById: Record<string, number> = {};
    if (allIds.length > 0) {
      const { data: expenseRows } = await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', allIds);
      consumedById = (expenseRows ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.project_id] = (acc[row.project_id] ?? 0) + Number(row.amount);
        return acc;
      }, {});
    }

    // `leadProjects` (lead_org_id = orgId) and `memberProjects`
    // (project_memberships.org_id = orgId) are meant to be disjoint — a
    // lead org's own projects should never also carry a project_memberships
    // row for that same org (see migration 0034's comment on
    // is_project_participant()). But that invariant lives in seed/app data,
    // not in a DB constraint, so a bad row (or a future bug) can violate it
    // silently. When it does, the same project.id shows up in both arrays,
    // gets pushed into `merged` twice, and crashes the list's `key={project.id}`
    // render with React's "two children with the same key" error. De-duping
    // by id here makes the list robust to that regardless of why it happened,
    // on top of fixing the bad seed row itself (see supabase/seed.sql).
    const byId = new Map<string, ProjectRow>();
    for (const p of leadProjects ?? []) {
      byId.set(p.id, {
        ...p,
        isLead: true,
        leadOrgName: null,
        consumedTotal: consumedById[p.id] ?? 0,
      });
    }
    for (const p of memberProjects) {
      if (!byId.has(p.id)) {
        byId.set(p.id, {
          ...p,
          isLead: false,
          leadOrgName: orgNameById[p.lead_org_id] ?? null,
          consumedTotal: consumedById[p.id] ?? 0,
        });
      }
    }
    const merged = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

    setProjects(merged);
    setLoading(false);
    setRefreshing(false);
    // Phase 3 §1.5 — project card cover thumbnails, same batched pattern
    // as team.tsx/vehicles.tsx.
    void getSignedUrlMap(merged.map((p) => p.cover_photo_url)).then(setCardPhotoUrlByPath);
  }

  const filtered = useMemo(() => {
    let list = projects;
    if (filter === 'actifs') list = list.filter((p) => p.status === 'active');
    else if (filter === 'termines') list = list.filter((p) => p.status === 'completed');
    else if (filter === 'invites') list = list.filter((p) => !p.isLead);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.client_name ?? '').toLowerCase().includes(q),
      );
    }

    if (minConsumedFilter > 0) {
      list = list.filter((p) => {
        if (!p.budget_total || p.budget_total <= 0) return false;
        const pct = (p.consumedTotal / p.budget_total) * 100;
        return pct >= minConsumedFilter;
      });
    }

    return list;
  }, [projects, filter, search, minConsumedFilter]);

  const canWrite = orgRole === 'owner' || orgRole === 'manager';

  // IMPROVEMENT-PLAN PHASE 4 (§3, prefill/suggestion layer) — "recently-used
  // addresses per org" and "autocomplete on repeat client names", both derived
  // from the already-loaded `projects` list (no extra query). Scoped to
  // projects.tsx only; organization-settings.tsx's org address is a singleton
  // (one row per org, entered once) — suggestion chips would add noise there,
  // not value. Judgment call documented in PHASE_4_BRIEF.md.
  //
  // Most recently created/updated projects first (project.created_at desc),
  // then deduplicated — so "recently used" is chronologically accurate, not
  // alphabetical. Limited to 6 distinct values each so the chip row stays
  // scannable on a phone screen without wrapping.
  const recentAddresses = useMemo((): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of [...projects].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )) {
      const v = (p.address ?? '').trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        result.push(v);
        if (result.length >= 6) break;
      }
    }
    return result;
  }, [projects]);

  const recentClientNames = useMemo((): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of [...projects].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )) {
      const v = (p.client_name ?? '').trim();
      if (v && !seen.has(v)) {
        seen.add(v);
        result.push(v);
        if (result.length >= 6) break;
      }
    }
    return result;
  }, [projects]);

  // Extracted so the list/grid toggle (UI/UX pass) can reuse the exact
  // same card in either a single-column YStack or a 2-column Grid without
  // duplicating the JSX.
  function renderProjectCard(project: ProjectRow) {
    const consumedPercent =
      project.budget_total && project.budget_total > 0
        ? Math.min(100, Math.round((project.consumedTotal / project.budget_total) * 100))
        : null;

    return (
      <YStack
        key={project.id}
        backgroundColor="$neutral0"
        borderRadius="$card"
        padding="$4"
        gap="$2"
        onPress={() => router.push(`/project/${project.id}` as never)}
        onLongPress={() => setDetailProject(project)}
        accessibilityRole="button"
        accessibilityLabel={project.name}
      >
        {project.cover_photo_url && cardPhotoUrlByPath[project.cover_photo_url] && (
          <Image
            src={cardPhotoUrlByPath[project.cover_photo_url]}
            width="100%"
            height={100}
            borderRadius={10}
          />
        )}
        <XStack justifyContent="space-between" alignItems="flex-start">
          <YStack flex={1} gap="$1">
            <Text fontSize={16} fontWeight="600" numberOfLines={1}>
              {project.name}
            </Text>
            {project.client_name && (
              <Text fontSize={13} color="$neutral500" numberOfLines={1}>
                {project.client_name}
              </Text>
            )}
          </YStack>
          {viewMode === 'list' && <CaretRightIcon size={18} color={color.neutral[500]} />}
        </XStack>

        <XStack gap="$2" flexWrap="wrap">
          <StatusBadge
            variant={
              project.status === 'active'
                ? 'success'
                : project.status === 'completed'
                  ? 'neutral'
                  : 'warning'
            }
          >
            {project.status === 'active'
              ? 'Actif'
              : project.status === 'completed'
                ? 'Terminé'
                : 'Archivé'}
          </StatusBadge>
          {!project.isLead && project.leadOrgName && (
            <StatusBadge variant="info">{project.leadOrgName}</StatusBadge>
          )}
        </XStack>

        {consumedPercent !== null && (
          <YStack gap="$1.5" marginTop="$1">
            <XStack justifyContent="space-between">
              <Text fontSize={12.5} color="$neutral500">
                Budget consommé
              </Text>
              <NumericText fontSize={12.5} fontWeight="600">
                {consumedPercent}%
              </NumericText>
            </XStack>
            {/* Phase 27 — refactored onto the shared ProgressBar
                (components/ui/Progress.tsx) instead of a hand-rolled View
                — picks up Doc 05 §3.3's full green/amber(80%)/red(100%)
                threshold instead of this card's previous two-step
                accent/red-at-90% logic. */}
            <ProgressBar value={consumedPercent} />
          </YStack>
        )}
      </YStack>
    );
  }

  function openCreateSheet() {
    setEditingProject(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setCoverPath(null);
    setCoverLocalUri(null);
    setCoverSignedUrl(null);
    setFormSheetOpen(true);
  }

  function openEditSheet(project: ProjectRow) {
    setDetailProject(null);
    setEditingProject(project);
    setForm({
      name: project.name,
      client_name: project.client_name ?? '',
      address: project.address ?? '',
      start_date: project.start_date ?? '',
      budget_total: project.budget_total != null ? String(project.budget_total) : '',
      project_type: (project.project_type as (typeof PROJECT_TYPES)[number]) ?? '',
    });
    setFormError(null);
    setCoverPath(project.cover_photo_url ?? null);
    setCoverLocalUri(null);
    setCoverSignedUrl(null);
    if (project.cover_photo_url) void getSignedUrl(project.cover_photo_url).then(setCoverSignedUrl);
    setFormSheetOpen(true);
  }

  async function pickCoverPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error(
        source === 'camera'
          ? "Autorisez l'accès à l'appareil photo pour prendre une photo."
          : "Autorisez l'accès à vos photos pour en choisir une.",
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setProcessingCover(true);
    try {
      const processed = await processPhoto(result.assets[0].uri);
      setCoverLocalUri(processed.uri);
    } catch {
      toast.error('Impossible de traiter la photo. Réessayez.');
    } finally {
      setProcessingCover(false);
    }
  }

  async function handleSave() {
    setFormError(null);

    const parsed = createProjectSchema.safeParse({
      name: form.name.trim(),
      client_name: form.client_name.trim() || undefined,
      address: form.address.trim() || undefined,
      start_date: form.start_date.trim(),
      budget_total: form.budget_total.trim() ? Number(form.budget_total) : undefined,
      project_type: form.project_type || undefined,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setSaving(true);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setSaving(false);
      return;
    }

    // Phase 3 §1.5 — upload-on-save-not-on-pick, same pattern as
    // vehicles.tsx: a cancelled sheet never orphans a Storage file.
    let finalCoverPath = coverPath;
    if (coverLocalUri) {
      finalCoverPath = await uploadOrgFile(orgId, 'projects', coverLocalUri, 'jpg', 'image/jpeg');
    }

    if (editingProject) {
      const { error } = await supabase
        .from('projects')
        .update({
          ...parsed.data,
          cover_photo_url: finalCoverPath,
          version: editingProject.version + 1,
        })
        .eq('id', editingProject.id)
        .eq('version', editingProject.version);

      if (error) {
        setFormError('Ce chantier a été modifié ailleurs. Rechargez et réessayez.');
        haptics.error();
        setSaving(false);
        return;
      }
      toast.success('Chantier mis à jour.');
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from('projects').insert({
        ...parsed.data,
        cover_photo_url: finalCoverPath,
        lead_org_id: orgId,
        created_by: session?.user.id,
      });

      if (error) {
        setFormError('Impossible de créer le chantier.');
        haptics.error();
        setSaving(false);
        return;
      }
      toast.success('Chantier créé.');
    }

    haptics.confirm();
    setSaving(false);
    setFormSheetOpen(false);
    await load();
  }

  function confirmDelete(project: ProjectRow) {
    setDetailProject(null);
    setDeleteTarget(project);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.rpc('soft_delete_project', { p_project_id: deleteTarget.id });
    setDeleting(false);
    if (error) {
      toast.error('Impossible de supprimer ce chantier.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Chantier déplacé vers la corbeille.');
    setDeleteTarget(null);
    await load();
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingHorizontal="$4">
        <SkeletonCardList cards={3} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <YStack paddingHorizontal="$4" paddingBottom="$3" gap="$3">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Chantiers
        </Text>

        <XStack gap="$2" alignItems="center">
          <XStack
            flex={1}
            backgroundColor="$neutral0"
            borderRadius="$control"
            paddingHorizontal={12}
            paddingVertical={9}
            alignItems="center"
            gap="$2"
            borderWidth={1}
            borderColor="$neutral300"
          >
            <MagnifyingGlassIcon size={16} color={color.neutral[500]} />
            <TextInput
              placeholder="Rechercher un chantier ou un client"
              placeholderTextColor={color.neutral[500]}
              value={search}
              onChangeText={setSearch}
              style={{ flex: 1, fontSize: 14, color: color.neutral[900] }}
            />
          </XStack>

          {/* Budget-consumed threshold filter — first real call site for
              both Popover and Slider (both built in the prior pass but
              unused until now). A small anchored panel is the right
              container here: one control, triggered from one button, no
              need for a full bottom sheet. */}
          <View ref={filterAnchorRef} collapsable={false}>
            <XStack
              width={40}
              height={40}
              borderRadius="$control"
              backgroundColor={minConsumedFilter > 0 ? '$accent600' : '$neutral0'}
              borderWidth={1}
              borderColor={minConsumedFilter > 0 ? '$accent600' : '$neutral300'}
              alignItems="center"
              justifyContent="center"
              onPress={() => setFilterPopoverOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Filtrer par budget consommé"
            >
              <FunnelIcon
                size={17}
                weight={minConsumedFilter > 0 ? 'fill' : 'regular'}
                color={minConsumedFilter > 0 ? 'white' : color.neutral[900]}
              />
            </XStack>
          </View>
        </XStack>

        <Popover
          visible={filterPopoverOpen}
          onClose={() => setFilterPopoverOpen(false)}
          anchorRef={filterAnchorRef}
          width={240}
        >
          <YStack padding="$2" gap="$3">
            <Text fontSize={13} fontWeight="600" color="$neutral900">
              Budget consommé minimum
            </Text>
            <Slider value={minConsumedFilter} onChange={setMinConsumedFilter} />
            {minConsumedFilter > 0 && (
              <XStack
                onPress={() => setMinConsumedFilter(0)}
                paddingVertical={6}
                justifyContent="center"
              >
                <Text fontSize={13} color="$accent600" fontWeight="500">
                  Réinitialiser
                </Text>
              </XStack>
            )}
          </YStack>
        </Popover>

        <XStack gap="$2" justifyContent="space-between" alignItems="center">
          <XStack gap="$2" flex={1} flexWrap="wrap">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <XStack
                  key={f.key}
                  paddingHorizontal={14}
                  paddingVertical={7}
                  borderRadius={999}
                  backgroundColor={active ? '$accent600' : '$neutral0'}
                  borderWidth={1}
                  borderColor={active ? '$accent600' : '$neutral300'}
                  onPress={() => setFilter(f.key)}
                  accessibilityRole="button"
                  accessibilityLabel={f.label}
                >
                  <Text fontSize={13} fontWeight="600" color={active ? '$neutral0' : '$neutral900'}>
                    {f.label}
                  </Text>
                </XStack>
              );
            })}
          </XStack>

          {/* List/grid toggle — was entirely absent; first real use of the
              new Grid primitive. Grid is the better fit once someone has
              more than a handful of chantiers on a wider device. */}
          <XStack backgroundColor="$neutral100" borderRadius="$control" padding={2} gap={2}>
            <XStack
              padding={7}
              borderRadius={9}
              backgroundColor={viewMode === 'list' ? '$neutral0' : 'transparent'}
              onPress={() => setViewMode('list')}
              accessibilityRole="button"
              accessibilityLabel="Vue liste"
            >
              <ListIcon
                size={16}
                weight={viewMode === 'list' ? 'bold' : 'regular'}
                color={color.neutral[900]}
              />
            </XStack>
            <XStack
              padding={7}
              borderRadius={9}
              backgroundColor={viewMode === 'grid' ? '$neutral0' : 'transparent'}
              onPress={() => setViewMode('grid')}
              accessibilityRole="button"
              accessibilityLabel="Vue grille"
            >
              <SquaresFourIcon
                size={16}
                weight={viewMode === 'grid' ? 'bold' : 'regular'}
                color={color.neutral[900]}
              />
            </XStack>
          </XStack>
        </XStack>
      </YStack>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BuildingsIcon}
          illustration="under-construction"
          title={
            projects.length === 0 ? 'Aucun chantier pour le moment' : 'Aucun chantier ne correspond'
          }
          description={
            projects.length === 0
              ? 'Créez votre premier chantier pour commencer à suivre budget, équipe et avancement.'
              : 'Essayez un autre filtre ou une autre recherche.'
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={color.accent[600]}
            />
          }
        >
          {viewMode === 'grid' ? (
            <Grid columns={2}>{filtered.map((project) => renderProjectCard(project))}</Grid>
          ) : (
            <YStack gap="$3">{filtered.map((project) => renderProjectCard(project))}</YStack>
          )}
        </ScrollView>
      )}

      {canWrite && (
        <FAB icon={PlusIcon} accessibilityLabel="Nouveau chantier" onPress={openCreateSheet} />
      )}

      {/* Project detail sheet — Phase 10: trimmed down to Modifier/
          Supprimer only now that project/[id].tsx is the real hub
          (Doc 03 §3.10.2). Reached via long-press; a normal tap opens
          the hub directly. */}
      <Sheet
        visible={detailProject !== null}
        onClose={() => setDetailProject(null)}
        title={detailProject?.name ?? ''}
      >
        {detailProject && (
          <YStack gap="$4">
            <YStack gap="$1.5">
              {detailProject.client_name && (
                <Text fontSize={14} color="$neutral500">
                  Client : {detailProject.client_name}
                </Text>
              )}
              {detailProject.address && (
                <Text fontSize={14} color="$neutral500">
                  Adresse : {detailProject.address}
                </Text>
              )}
              {detailProject.start_date && (
                <Text fontSize={14} color="$neutral500">
                  Début : {detailProject.start_date}
                </Text>
              )}
              {detailProject.project_type && (
                <Text fontSize={14} color="$neutral500">
                  Type :{' '}
                  {
                    PROJECT_TYPE_LABELS[
                      detailProject.project_type as (typeof PROJECT_TYPES)[number]
                    ]
                  }
                </Text>
              )}
            </YStack>

            <Button
              variant="secondary"
              onPress={() => {
                setDetailProject(null);
                router.push(`/project/${detailProject.id}` as never);
              }}
            >
              Ouvrir le chantier
            </Button>

            {detailProject.isLead && canWrite && (
              <YStack gap="$2">
                <Button variant="secondary" onPress={() => openEditSheet(detailProject)}>
                  Modifier
                </Button>
                <Button variant="secondary" onPress={() => confirmDelete(detailProject)}>
                  Supprimer
                </Button>
              </YStack>
            )}
          </YStack>
        )}
      </Sheet>

      {/* Create / edit sheet — Doc 03 §3.10.3 */}
      <Sheet
        visible={formSheetOpen}
        onClose={() => setFormSheetOpen(false)}
        title={editingProject ? 'Modifier le chantier' : 'Nouveau chantier'}
      >
        <YStack gap="$3">
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="500">
              Photo de couverture
            </Text>
            {coverLocalUri || coverSignedUrl ? (
              <XStack alignItems="center" gap="$3">
                <Image
                  source={{ uri: coverLocalUri ?? coverSignedUrl ?? undefined }}
                  width={72}
                  height={72}
                  borderRadius={12}
                />
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => {
                    setCoverPath(null);
                    setCoverLocalUri(null);
                    setCoverSignedUrl(null);
                  }}
                >
                  Retirer
                </Button>
              </XStack>
            ) : (
              <XStack gap="$2">
                <Button
                  variant="secondary"
                  icon={CameraIcon}
                  loading={processingCover}
                  onPress={() => void pickCoverPhoto('camera')}
                >
                  Appareil photo
                </Button>
                <Button
                  variant="secondary"
                  icon={ImageIcon}
                  loading={processingCover}
                  onPress={() => void pickCoverPhoto('library')}
                >
                  Galerie
                </Button>
              </XStack>
            )}
          </YStack>

          <FormField
            label="Nom du chantier"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <YStack gap="$1.5">
            <FormField
              label="Client"
              value={form.client_name}
              onChangeText={(v) => setForm((f) => ({ ...f, client_name: v }))}
            />
            {/* IMPROVEMENT-PLAN PHASE 4 (§3) — autocomplete chips for
                repeat client names. Filtered to names that include the
                current input (empty = show all recent), hidden when the
                input already exactly matches a chip (no point showing it).
                Tap-to-fill only: not a hard picker. */}
            {(() => {
              const q = form.client_name.trim().toLowerCase();
              const chips = recentClientNames.filter(
                (n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q,
              );
              if (chips.length === 0) return null;
              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$2" paddingVertical={2}>
                    {chips.map((name) => (
                      <XStack
                        key={name}
                        paddingHorizontal={10}
                        paddingVertical={5}
                        borderRadius={999}
                        backgroundColor="$neutral100"
                        borderWidth={1}
                        borderColor="$neutral200"
                        onPress={() => setForm((f) => ({ ...f, client_name: name }))}
                        accessibilityRole="button"
                      >
                        <Text fontSize={12.5} color="$neutral700">
                          {name}
                        </Text>
                      </XStack>
                    ))}
                  </XStack>
                </ScrollView>
              );
            })()}
          </YStack>
          <YStack gap="$1.5">
            <FormField
              label="Adresse"
              value={form.address}
              onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
            />
            {/* IMPROVEMENT-PLAN PHASE 4 (§3) — recently-used address chips,
                same pattern as client name above. */}
            {(() => {
              const q = form.address.trim().toLowerCase();
              const chips = recentAddresses.filter(
                (a) => a.toLowerCase().includes(q) && a.toLowerCase() !== q,
              );
              if (chips.length === 0) return null;
              return (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$2" paddingVertical={2}>
                    {chips.map((addr) => (
                      <XStack
                        key={addr}
                        paddingHorizontal={10}
                        paddingVertical={5}
                        borderRadius={999}
                        backgroundColor="$neutral100"
                        borderWidth={1}
                        borderColor="$neutral200"
                        onPress={() => setForm((f) => ({ ...f, address: addr }))}
                        accessibilityRole="button"
                      >
                        <Text fontSize={12.5} color="$neutral700" numberOfLines={1}>
                          {addr}
                        </Text>
                      </XStack>
                    ))}
                  </XStack>
                </ScrollView>
              );
            })()}
          </YStack>
          <DatePicker
            label="Date de début"
            value={form.start_date || null}
            onChange={(v) => setForm((f) => ({ ...f, start_date: v }))}
          />
          <FormField
            label="Budget total (TND)"
            value={form.budget_total}
            onChangeText={(v) => setForm((f) => ({ ...f, budget_total: v }))}
            keyboardType="numeric"
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Type de projet
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              {PROJECT_TYPES.map((type) => {
                const active = form.project_type === type;
                return (
                  <XStack
                    key={type}
                    paddingHorizontal={14}
                    paddingVertical={8}
                    borderRadius={999}
                    backgroundColor={active ? '$accent600' : '$neutral100'}
                    onPress={() => setForm((f) => ({ ...f, project_type: type }))}
                    accessibilityRole="button"
                    accessibilityLabel={PROJECT_TYPE_LABELS[type]}
                  >
                    <Text
                      fontSize={13}
                      fontWeight="600"
                      color={active ? '$neutral0' : '$neutral900'}
                    >
                      {PROJECT_TYPE_LABELS[type]}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>
          </YStack>

          {formError && (
            <Text fontSize={13} color="$danger">
              {formError}
            </Text>
          )}

          <Button onPress={() => void handleSave()} loading={saving}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Supprimer ce chantier ?"
        description={
          deleteTarget
            ? `${deleteTarget.name} sera déplacé vers la corbeille et restaurable pendant 30 jours.`
            : undefined
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </YStack>
  );
}

import { color } from '@dala/design-tokens';
import type { Organization, Project } from '@dala/shared-types';
import { createProjectSchema, PROJECT_TYPES } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import {
  BuildingsIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
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
 *     expenses.tsx, materials.tsx, journal.tsx, safety.tsx, dispatch.tsx
 *     were all built in earlier phases as STANDALONE screens with their
 *     own project picker, deliberately not nested under a Project Detail
 *     hub that doesn't exist (see expenses.tsx's own header). Rebuilding
 *     all five of those into tabs of one hub is a much larger undertaking
 *     than "build the list + create/edit screen" and isn't attempted here
 *     — tapping a project below opens a lightweight detail SHEET (name,
 *     client, address, budget-consumed, edit, delete, and plain links out
 *     to those five existing screens), not the full tab-bar hub §3.10.2
 *     describes. None of those five screens accept a project_id param
 *     today, so the links land on each screen's own picker rather than
 *     pre-filtered — noted honestly rather than claimed as deep-linked.
 *   - Progress % / progress ring (mentioned in §3.10.1/§3.10.2) has no
 *     backing data model anywhere in this schema (no milestones/tasks
 *     table, confirmed by grepping every migration) — building actual
 *     progress tracking is new speculative ground, exactly what this
 *     phase was scoped to avoid. Only the budget-consumed bar (real,
 *     computable from project_expenses) is shown.
 *   - Search (§3.10.1) filters client-side over the already-fetched list
 *     rather than calling the `search_rpc` (migration 0012) — simpler,
 *     and fine at the list sizes one org actually has.
 *   - No native date-picker dependency exists anywhere in this repo yet
 *     (confirmed by grepping for @react-native-community/datetimepicker
 *     and equivalents). Adding one is a native-linking/prebuild change,
 *     out of proportion for one field this phase — "Date de début" is a
 *     plain AAAA-MM-JJ text field with the same validation
 *     (createProjectSchema) a real picker would feed into anyway.
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
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [filter, setFilter] = useState<FilterKey>('tous');
  const [search, setSearch] = useState('');
  const [orgRole, setOrgRole] = useState<'owner' | 'manager' | 'viewer' | null>(null);

  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detailProject, setDetailProject] = useState<ProjectRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setProjects([]);
      setLoading(false);
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

    const merged: ProjectRow[] = [
      ...(leadProjects ?? []).map((p) => ({
        ...p,
        isLead: true,
        leadOrgName: null,
        consumedTotal: consumedById[p.id] ?? 0,
      })),
      ...memberProjects.map((p) => ({
        ...p,
        isLead: false,
        leadOrgName: orgNameById[p.lead_org_id] ?? null,
        consumedTotal: consumedById[p.id] ?? 0,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    setProjects(merged);
    setLoading(false);
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
    return list;
  }, [projects, filter, search]);

  const canWrite = orgRole === 'owner' || orgRole === 'manager';

  function openCreateSheet() {
    setEditingProject(null);
    setForm(EMPTY_FORM);
    setFormError(null);
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
    setFormSheetOpen(true);
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

    if (editingProject) {
      const { error } = await supabase
        .from('projects')
        .update({ ...parsed.data, version: editingProject.version + 1 })
        .eq('id', editingProject.id)
        .eq('version', editingProject.version);

      if (error) {
        setFormError('Ce chantier a été modifié ailleurs. Rechargez et réessayez.');
        haptics.error();
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from('projects').insert({
        ...parsed.data,
        lead_org_id: orgId,
        created_by: session?.user.id,
      });

      if (error) {
        setFormError('Impossible de créer le chantier.');
        haptics.error();
        setSaving(false);
        return;
      }
    }

    haptics.confirm();
    setSaving(false);
    setFormSheetOpen(false);
    await load();
  }

  function confirmDelete(project: ProjectRow) {
    setDetailProject(null);
    Alert.alert(
      'Supprimer ce chantier ?',
      `${project.name} sera déplacé vers la corbeille et restaurable pendant 30 jours.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => void handleDelete(project),
        },
      ],
    );
  }

  async function handleDelete(project: ProjectRow) {
    const { error } = await supabase.rpc('soft_delete_project', { p_project_id: project.id });
    if (error) {
      Alert.alert('Erreur', 'Impossible de supprimer ce chantier.');
      haptics.error();
      return;
    }
    haptics.confirm();
    await load();
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56} paddingHorizontal="$4">
        <SkeletonCardList cards={3} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <YStack paddingTop={56} paddingHorizontal="$4" paddingBottom="$3" gap="$3">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Chantiers
        </Text>

        <XStack
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

        <XStack gap="$2">
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 96 }}>
          <YStack gap="$3">
            {filtered.map((project) => {
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
                  onPress={() => setDetailProject(project)}
                  accessibilityRole="button"
                  accessibilityLabel={project.name}
                >
                  <XStack justifyContent="space-between" alignItems="flex-start">
                    <YStack flex={1} gap="$1">
                      <Text fontSize={16} fontWeight="600">
                        {project.name}
                      </Text>
                      {project.client_name && (
                        <Text fontSize={13} color="$neutral500">
                          {project.client_name}
                        </Text>
                      )}
                    </YStack>
                    <CaretRightIcon size={18} color={color.neutral[500]} />
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
                      <View
                        height={6}
                        borderRadius={999}
                        backgroundColor="$neutral100"
                        overflow="hidden"
                      >
                        <View
                          height={6}
                          borderRadius={999}
                          width={`${consumedPercent}%` as `${number}%`}
                          backgroundColor={consumedPercent >= 90 ? '$danger' : '$accent600'}
                        />
                      </View>
                    </YStack>
                  )}
                </YStack>
              );
            })}
          </YStack>
        </ScrollView>
      )}

      {canWrite && (
        <FAB icon={PlusIcon} accessibilityLabel="Nouveau chantier" onPress={openCreateSheet} />
      )}

      {/* Project detail sheet — lightweight stand-in for Doc 03 §3.10.2's
          full tab-bar hub, see this file's header. */}
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

            <YStack gap="$2">
              <Text fontSize={13} fontWeight="600" color="$neutral500">
                ACCÈS RAPIDE
              </Text>
              {[
                { href: '/dispatch', label: 'Dispatch' },
                { href: '/expenses', label: 'Dépenses' },
                { href: '/materials', label: 'Matériaux' },
                { href: '/journal', label: 'Journal' },
                { href: '/safety', label: 'Sécurité' },
              ].map((link) => (
                <XStack
                  key={link.href}
                  justifyContent="space-between"
                  alignItems="center"
                  paddingVertical={10}
                  onPress={() => {
                    setDetailProject(null);
                    router.push(link.href as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={link.label}
                >
                  <Text fontSize={15}>{link.label}</Text>
                  <CaretRightIcon size={16} color={color.neutral[500]} />
                </XStack>
              ))}
            </YStack>

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
          <FormField
            label="Nom du chantier"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          />
          <FormField
            label="Client"
            value={form.client_name}
            onChangeText={(v) => setForm((f) => ({ ...f, client_name: v }))}
          />
          <FormField
            label="Adresse"
            value={form.address}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
          />
          <FormField
            label="Date de début (AAAA-MM-JJ)"
            value={form.start_date}
            onChangeText={(v) => setForm((f) => ({ ...f, start_date: v }))}
            placeholder="2026-01-15"
            keyboardType="numbers-and-punctuation"
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
    </YStack>
  );
}

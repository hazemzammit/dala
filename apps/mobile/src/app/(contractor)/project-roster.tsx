import { color } from '@dala/design-tokens';
import type { ProjectWorker, Worker } from '@dala/shared-types';
import { addProjectWorkerSchema, removeProjectWorkerSchema } from '@dala/validation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/project-roster.tsx
 *
 * Doc 03 §3.10.2 Équipe tab — Phase 12. Migration 0034_project_workers.sql
 * shipped the schema in Phase 11 planning; this is the first real UI against
 * it. Named `project-roster.tsx`, not `team.tsx` or `equipe.tsx`, on
 * purpose: `team.tsx` already exists and is the org's WHOLE worker roster
 * (invite/soft-delete, unscoped to any project) — a different table
 * (`workers`) and a different question ("who works for my org at all") than
 * this screen's ("who's staffed on THIS project right now",
 * `project_workers`). Reusing team.tsx's name or folding this into it would
 * conflate the two the same way the migration's own header warns against
 * conflating dispatch (scheduling) with staffing.
 *
 * Deep-linked the same way Dispatch/Dépenses/Journal are from
 * project/[id].tsx — a flat top-level route accepting `?project_id=`, not a
 * nested dynamic segment — except this screen has no meaningful "no
 * project" mode the way dispatch.tsx does (project_workers doesn't exist
 * without a project), so a missing `project_id` is treated as an error
 * state rather than a second, unscoped screen.
 *
 * Visibility: wired into project/[id].tsx's tab row for BOTH lead and
 * trade-participant orgs, same Shared-layer reasoning as Dispatch (Phase
 * 11) and Journal (Phase 10) — not itemized financial data, and
 * `project_workers_select_member`'s `is_org_member(org_id)` policy already
 * means each org only ever sees its own roster rows regardless, so a trade
 * org seeing this tab can't see the lead org's (or another trade org's)
 * staffing. Flagged as the same kind of interpretation those two were, not
 * a literal spec line.
 *
 * Read/write split: SELECT needs no role check (any org member sees the
 * roster); add/remove requires owner/manager AND real project participation
 * (`project_workers_write_owner_manager`, 0034) — mirrored client-side via
 * `getMyOrgRole()` (same pattern as expenses.tsx) so a viewer never sees the
 * FAB or the remove action, rather than seeing them fail on tap.
 *
 * Phase 13 decision, made explicitly rather than left open: staffing
 * history now DOES freeze once a project is archived/completed, the same
 * way Dispatch's Phase-11 retrofit made assignments read-only on a
 * finished project. Doc 03 §3.10.2 didn't say either way for staffing
 * specifically, so this was a real call, not a technical gap — reasoning
 * recorded as Doc 00 §0.5 decision #26: a roster is a record of who
 * actually worked a finished job (payroll/CNSS reporting depends on it
 * being stable), so letting it keep changing after the project closes
 * creates the same "which version is authoritative" problem Dispatch's
 * retrofit was written to avoid. Implementation mirrors dispatch.tsx's
 * `readOnly` flag exactly: FAB and "Retirer" hidden once `project.status
 * !== 'active'`, existing roster rows still fully visible and readable.
 */

interface RosterRow extends ProjectWorker {
  worker: Worker | null;
}

export default function ProjectRosterScreen() {
  const toast = useToast();
  const { project_id } = useLocalSearchParams<{ project_id: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [orgWorkers, setOrgWorkers] = useState<Worker[]>([]);
  const [orgWorkersLoading, setOrgWorkersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingWorkerId, setAddingWorkerId] = useState<string | null>(null);
  const [removingRowId, setRemovingRowId] = useState<string | null>(null);
  // Themed ConfirmDialog replacing Alert.alert's destructive two-button variant.
  const [removeTarget, setRemoveTarget] = useState<RosterRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [project_id]),
  );

  async function load(isRefresh = false) {
    if (!project_id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const org = await getActiveOrgId();
    setOrgId(org);

    // Doc 03 §3.10.2 / decision #26 — staffing is locked once the project
    // is archived/completed, same readOnly reasoning as dispatch.tsx.
    const { data: projectRow } = await supabase
      .from('projects')
      .select('status')
      .eq('id', project_id)
      .maybeSingle();

    if (org) {
      const role = await getMyOrgRole(org);
      const isActive = (projectRow?.status ?? 'active') === 'active';
      setCanWrite((role === 'owner' || role === 'manager') && isActive);
    }

    // RLS (project_workers_select_member, 0034) already scopes this to the
    // caller's own org's rows on the project — no need to filter by org_id
    // here, an unrelated or trade-participant org just gets its own subset.
    const { data: rosterRows } = await supabase
      .from('project_workers')
      .select('*')
      .eq('project_id', project_id)
      .is('removed_at', null)
      .order('added_at', { ascending: true });

    const workerIds = (rosterRows ?? []).map((r) => r.worker_id);
    const { data: workerRows } = workerIds.length
      ? await supabase.from('workers').select('*').in('id', workerIds)
      : { data: [] as Worker[] };

    const merged: RosterRow[] = (rosterRows ?? []).map((r) => ({
      ...r,
      worker: (workerRows ?? []).find((w) => w.id === r.worker_id) ?? null,
    }));

    setRoster(merged);
    setLoading(false);
    setRefreshing(false);
  }

  const rosterWorkerIds = useMemo(() => new Set(roster.map((r) => r.worker_id)), [roster]);

  const filteredOrgWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orgWorkers.filter((w) => {
      if (rosterWorkerIds.has(w.id)) return false; // never a worker already on the active roster
      if (!query) return true;
      return w.full_name.toLowerCase().includes(query);
    });
  }, [orgWorkers, rosterWorkerIds, searchQuery]);

  async function openAddSheet() {
    if (!orgId) return;
    setSearchQuery('');
    setAddSheetOpen(true);
    setOrgWorkersLoading(true);
    // Scoped to the org's OWN active workers only (active_workers view,
    // filtered by org_id) — never another org's roster, per the brief.
    const { data } = await supabase
      .from('active_workers')
      .select('*')
      .eq('org_id', orgId)
      .order('full_name');
    setOrgWorkers(data ?? []);
    setOrgWorkersLoading(false);
  }

  async function handleAddWorker(worker: Worker) {
    if (!project_id || addingWorkerId) return;

    const parsed = addProjectWorkerSchema.safeParse({
      project_id,
      worker_id: worker.id,
    });
    if (!parsed.success) {
      haptics.error();
      return;
    }

    setAddingWorkerId(worker.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée.');

      // org_id is deliberately NOT set here — the before-insert trigger
      // (set_project_worker_org_id, 0034) derives it from workers.org_id,
      // failing closed via workers' own RLS if this worker somehow isn't
      // visible to the caller. Client-settable org_id would reopen exactly
      // the spoofing vector that trigger closes.
      const { error } = await supabase.from('project_workers').insert({
        project_id: parsed.data.project_id,
        worker_id: parsed.data.worker_id,
        added_by: session.user.id,
      });
      if (error) throw error;

      haptics.confirm();
      toast.success(`${worker.full_name} ajouté au chantier.`);
      setAddSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? "Impossible d'ajouter ce travailleur au chantier.");
    } finally {
      setAddingWorkerId(null);
    }
  }

  function confirmRemove(row: RosterRow) {
    setRemoveTarget(row);
  }

  async function handleRemove() {
    if (!removeTarget) return;
    const parsed = removeProjectWorkerSchema.safeParse({ id: removeTarget.id });
    if (!parsed.success) {
      haptics.error();
      return;
    }

    setRemovingRowId(removeTarget.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée.');

      // Soft-delete only (removed_at/removed_by) — never a hard delete, so
      // the historical row (and the reactivation path a fresh dispatch
      // assignment would use) is preserved. See migration 0034's header.
      const { error } = await supabase
        .from('project_workers')
        .update({ removed_at: new Date().toISOString(), removed_by: session.user.id })
        .eq('id', parsed.data.id);
      if (error) throw error;

      haptics.confirm();
      toast.success(`${removeTarget.worker?.full_name ?? 'Travailleur'} retiré du chantier.`);
      setRemoveTarget(null);
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de retirer ce travailleur.');
    } finally {
      setRemovingRowId(null);
    }
  }

  if (!project_id) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingHorizontal="$4">
        <XStack alignItems="center" gap="$3" marginBottom="$4">
          <XStack
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <ArrowLeftIcon size={20} />
          </XStack>
          <Text fontSize={16} fontWeight="600">
            Chantier introuvable
          </Text>
        </XStack>
      </YStack>
    );
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack alignItems="center" gap="$3" paddingHorizontal="$4" marginBottom="$3">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600">
          Équipe
        </Text>
      </XStack>

      {roster.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          illustration="team"
          title="Aucun travailleur sur ce chantier"
          description={
            canWrite
              ? 'Ajoutez un travailleur avec le bouton +, ou planifiez un dispatch — les travailleurs dispatchés sont ajoutés automatiquement.'
              : 'Aucun travailleur n\u2019est actuellement staffé sur ce chantier.'
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={color.accent[600]}
            />
          }
        >
          <YStack gap="$2">
            {roster.map((row) => (
              <XStack
                key={row.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                justifyContent="space-between"
                alignItems="center"
              >
                <XStack gap="$3" alignItems="center" flex={1}>
                  <Avatar name={row.worker?.full_name ?? '?'} />
                  <YStack gap="$1" flex={1}>
                    <Text fontSize={15.5} fontWeight="600" numberOfLines={1}>
                      {row.worker?.full_name ?? 'Travailleur supprimé'}
                    </Text>
                    <Text fontSize={13} color="$neutral500">
                      {row.worker?.trade ?? '—'}
                    </Text>
                  </YStack>
                </XStack>
                {canWrite && (
                  <XStack
                    padding={6}
                    onPress={() => confirmRemove(row)}
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer ${row.worker?.full_name ?? 'ce travailleur'} du chantier`}
                    opacity={removingRowId === row.id ? 0.5 : 1}
                  >
                    <TrashIcon size={18} color={color.neutral[500]} />
                  </XStack>
                )}
              </XStack>
            ))}
          </YStack>
        </ScrollView>
      )}

      {canWrite && (
        <FAB icon={PlusIcon} accessibilityLabel="Ajouter un ouvrier" onPress={openAddSheet} />
      )}

      <Sheet
        visible={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        title="Ajouter un ouvrier"
      >
        <YStack gap="$3">
          <FormField
            label="Rechercher"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Nom du travailleur"
            autoCapitalize="none"
          />

          {orgWorkersLoading ? (
            <SkeletonList rows={3} />
          ) : filteredOrgWorkers.length === 0 ? (
            <XStack alignItems="center" gap="$2" paddingVertical="$4" justifyContent="center">
              <MagnifyingGlassIcon size={18} color={color.neutral[500]} />
              <Text fontSize={14} color="$neutral500">
                {orgWorkers.length === 0
                  ? 'Aucun travailleur actif dans votre organisation.'
                  : 'Aucun résultat, ou tous vos travailleurs sont déjà sur ce chantier.'}
              </Text>
            </XStack>
          ) : (
            <YStack gap="$2">
              {filteredOrgWorkers.map((worker) => (
                <XStack
                  key={worker.id}
                  backgroundColor="$neutral25"
                  borderRadius="$card"
                  padding="$3"
                  alignItems="center"
                  gap="$3"
                  onPress={() => void handleAddWorker(worker)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajouter ${worker.full_name}`}
                  opacity={addingWorkerId === worker.id ? 0.5 : 1}
                >
                  <Avatar name={worker.full_name} size={28} />
                  <YStack flex={1}>
                    <Text fontSize={14.5} fontWeight="500">
                      {worker.full_name}
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      {worker.trade ?? '—'}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </YStack>
          )}
        </YStack>
      </Sheet>

      <ConfirmDialog
        visible={removeTarget !== null}
        title="Retirer du chantier ?"
        description={
          removeTarget
            ? `${removeTarget.worker?.full_name ?? 'Ce travailleur'} ne sera plus listé comme actif sur ce chantier. Son historique est conservé.`
            : undefined
        }
        confirmLabel="Retirer"
        loading={removingRowId === removeTarget?.id}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </YStack>
  );
}

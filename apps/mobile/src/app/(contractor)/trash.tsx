import { color } from '@dala/design-tokens';
import type { TrashItem } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { BuildingsIcon, CarIcon, HardHatIcon, NoteIcon, TrashIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/trash.tsx
 *
 * NEW in Phase 5 — Doc 02 §2.10 "project/worker Trash screen." Reachable
 * from the Plus sheet (matching how Reports/Billing are reached), since
 * Doc 03 §3.22's Settings sectioned list doesn't itself list a Trash row.
 *
 * SCOPE NOTE, stated plainly rather than glossed over: this screen lists
 * and restores soft-deleted rows for BOTH entity types the roadmap names —
 * projects (migration 0013/0006) and workers (migration 0025, this phase).
 * Worker deletion is fully wired end-to-end this phase (team.tsx's new
 * delete action). Project deletion had NO entry point anywhere in mobile
 * at the time this file was written (Phase 5), because
 * apps/mobile/(contractor)/projects.tsx was still an unbuilt empty-state
 * stub (confirmed by reading it before writing this file) — that was a
 * pre-existing Phase 1/3 gap, not something Phase 5's scope covered
 * rebuilding.
 *
 * STALE BY PHASE 7, CORRECTED PHASE 14: projects.tsx was built out for
 * real in Phase 7, including a working `soft_delete_project` call from its
 * own delete flow — this file's claim above about "NO entry point
 * anywhere" stopped being true then, but nobody updated this comment until
 * Phase 14's re-read of every screen's own status claims turned it up
 * (same pattern as portfolio.tsx and notification-settings.tsx's stale
 * comments, found the same pass). This screen's actual behavior needs no
 * code change either way — it always correctly showed and restored any
 * soft-deleted project regardless of which surface deleted it — only this
 * comment was out of date.
 *
 * 30-day window and purge_soft_deleted_records() are both server-side
 * (migrations 0013/0025/0076) — this screen only shows what's already
 * recoverable, it doesn't compute the window itself.
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.2) — two more entity types added, exactly
 * per that section's own "extend trash/restore to vehicles and journal
 * entries" wording:
 *   - `vehicles.deleted_at` (migration 0076, this phase) — vehicles.tsx
 *     gained its own delete affordance this same phase (SwipeableRow +
 *     ConfirmDialog, matching team.tsx's worker-delete precedent, since a
 *     vehicle deletion — unlike a journal entry or an expense row — isn't
 *     the "lower-stakes" case §9.2 carves out for the lighter undo-toast).
 *   - `site_logs.deleted_at` (migration 0072, Phase 6) — `restore_site_log()`
 *     was built back in Phase 6 but PHASE_6_BRIEF.md §2 explicitly
 *     disclosed it was never wired into this screen ("added to trash.tsx
 *     scope would be new UI beyond that list"). That disclosed gap is
 *     closed here. NOTE: journal.tsx's own delete flow (this phase) uses
 *     the lighter UndoToast pattern for its OWN immediate undo window —
 *     this screen is the second-chance surface for an entry whose toast
 *     already expired unactioned, exactly the same relationship
 *     `pointage.tsx`'s 5s bulk-undo and this screen have for workers (a
 *     short local undo AND a 30-day server-side one are not mutually
 *     exclusive; they cover two different windows of time).
 *   - `project_expenses` is deliberately NOT added here — see
 *     migration 0076's own Part 2 header for the disclosed reason
 *     (§9.2 names expenses only as an undo-toast example, not in its
 *     "extend trash/restore to..." sentence).
 *   - Journal entries show their caption/note text (truncated) as the
 *     label, falling back to "Entrée sans légende" — `site_logs` has no
 *     single "name" column the way projects/workers/vehicles do.
 */
export default function TrashScreen() {
  const toast = useToast();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Phase 20 (§1.7a) — same fix as the other list screens this batch:
  // none of the four deleted-entity queries below had their errors
  // captured, so a failed fetch rendered identically to a genuinely-empty
  // trash.
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [
      { data: deletedProjects, error: projectsError },
      { data: deletedWorkers, error: workersError },
      { data: deletedVehicles, error: vehiclesError },
      { data: deletedLogs, error: logsError },
    ] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, deleted_at')
        .eq('lead_org_id', orgId)
        .not('deleted_at', 'is', null),
      supabase
        .from('workers')
        .select('id, full_name, deleted_at')
        .eq('org_id', orgId)
        .not('deleted_at', 'is', null),
      // Phase 11 §9.2 — vehicles (migration 0076).
      supabase
        .from('vehicles')
        .select('id, name, deleted_at')
        .eq('org_id', orgId)
        .not('deleted_at', 'is', null),
      // Phase 11 §9.2 — journal entries (site_logs.deleted_at, migration
      // 0072, restore_site_log() finally wired here). site_logs has no
      // org_id column directly (confirmed by re-reading 0008) — scoped
      // via project_id in (org's own project ids) instead.
      (async () => {
        const { data: orgProjectIds, error: idsError } = await supabase
          .from('projects')
          .select('id')
          .eq('lead_org_id', orgId);
        if (idsError) return { data: null, error: idsError };
        const ids = (orgProjectIds ?? []).map((p) => p.id);
        if (ids.length === 0)
          return {
            data: [] as {
              id: string;
              caption: string | null;
              note_text: string | null;
              deleted_at: string;
            }[],
            error: null,
          };
        return supabase
          .from('site_logs')
          .select('id, caption, note_text, deleted_at')
          .in('project_id', ids)
          .not('deleted_at', 'is', null);
      })(),
    ]);

    if (projectsError || workersError || vehiclesError || logsError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const merged: TrashItem[] = [
      ...(deletedProjects ?? []).map((p) => ({
        entity_type: 'project' as const,
        id: p.id,
        label: p.name,
        deleted_at: p.deleted_at as string,
      })),
      ...(deletedWorkers ?? []).map((w) => ({
        entity_type: 'worker' as const,
        id: w.id,
        label: w.full_name,
        deleted_at: w.deleted_at as string,
      })),
      ...(deletedVehicles ?? []).map((v) => ({
        entity_type: 'vehicle' as const,
        id: v.id,
        label: v.name,
        deleted_at: v.deleted_at as string,
      })),
      ...(deletedLogs ?? []).map((l) => ({
        entity_type: 'site_log' as const,
        id: l.id,
        label: (l.caption || l.note_text || 'Entrée sans légende').slice(0, 60),
        deleted_at: l.deleted_at as string,
      })),
    ].sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));

    setItems(merged);
    setLoading(false);
    setRefreshing(false);
  }

  function daysRemaining(deletedAt: string): number {
    const deletedMs = new Date(deletedAt).getTime();
    const elapsedDays = (Date.now() - deletedMs) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(30 - elapsedDays));
  }

  async function handleRestore(item: TrashItem) {
    const rpcByType: Record<TrashItem['entity_type'], { rpc: string; param: string }> = {
      project: { rpc: 'restore_project', param: 'p_project_id' },
      worker: { rpc: 'restore_worker', param: 'p_worker_id' },
      // Phase 11 §9.2 additions.
      vehicle: { rpc: 'restore_vehicle', param: 'p_vehicle_id' },
      site_log: { rpc: 'restore_site_log', param: 'p_log_id' },
    };
    const { rpc, param } = rpcByType[item.entity_type];

    const { error } = await supabase.rpc(rpc, { [param]: item.id });
    if (error) {
      toast.error('Impossible de restaurer cet élément.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success(`${item.label} restauré.`);
    await load();
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
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

  if (items.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={TrashIcon}
          icon3d="archive-box"
          title="La corbeille est vide"
          description="Les chantiers, travailleurs, véhicules et entrées de journal supprimés apparaissent ici pendant 30 jours avant suppression définitive."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Corbeille
        </Text>
        <Text fontSize={13} color="$neutral500" marginTop="$1">
          Restaurable pendant 30 jours après suppression.
        </Text>
      </YStack>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <YStack gap="$2">
          {items.map((item) => {
            const remaining = daysRemaining(item.deleted_at);
            const ItemIcon =
              item.entity_type === 'project'
                ? BuildingsIcon
                : item.entity_type === 'vehicle'
                  ? CarIcon
                  : item.entity_type === 'site_log'
                    ? NoteIcon
                    : HardHatIcon;
            return (
              <XStack
                key={`${item.entity_type}-${item.id}`}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                justifyContent="space-between"
                alignItems="center"
              >
                <XStack gap="$3" alignItems="center" flex={1}>
                  <ItemIcon size={20} color={color.neutral[500]} />
                  <YStack gap="$1" flex={1}>
                    <Text fontSize={15.5} fontWeight="600">
                      {item.label}
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      {remaining > 0
                        ? `Supprimé définitivement dans ${remaining} jour${remaining > 1 ? 's' : ''}`
                        : 'Suppression définitive imminente'}
                    </Text>
                  </YStack>
                </XStack>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => void handleRestore(item)}
                >
                  Restaurer
                </Button>
              </XStack>
            );
          })}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

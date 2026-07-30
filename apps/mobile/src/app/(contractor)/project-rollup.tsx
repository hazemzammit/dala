import type { Project, ProjectStatus } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { BuildingsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/project-rollup.tsx
 *
 * Doc 02 §2.10 "Phase 6+ — multi-project rollup dashboards" — the roadmap
 * names this in one line with zero further spec anywhere in Doc 02/03
 * (confirmed by grep before writing this; see delivery notes). Confirmed
 * with the user this means: a dashboard rolling up multiple PROJECTS
 * WITHIN one org — distinct from both:
 *   - budget_rollup / budget_rollup_opt_in (Doc 02 §2.8, per-PROJECT
 *     cross-ORG financial visibility for trade subcontractors), and
 *   - vue-ensemble.tsx (Doc 02 §2.8a, per-owned-ORG summary across
 *     multiple ORGS for a multi-org account owner).
 * All three are genuinely different axes of "rollup" that happen to share
 * the word; this file is the first of the three that rolls up by project.
 *
 * SCOPE NOTE, stated plainly rather than silently expanded: this screen
 * does NOT build Doc 03 §3.9's full Home/Dashboard (dashboard.tsx is still
 * that screen's minimum-slice placeholder — see its own header) and does
 * NOT build the projects.tsx list/CRUD screen (still an empty-state stub,
 * a separate Phase 1/3 gap, not folded into this). This is a standalone
 * read-only rollup screen, same "minimum slice for a real entry point"
 * reasoning Phase 4 used for vue-ensemble.tsx — reachable from a new row
 * on Dashboard, reading directly from `projects` + related tables rather
 * than waiting on either of those larger, separately-scoped screens.
 *
 * Per-project stats are fetched client-side in parallel (same pattern as
 * vue-ensemble.tsx's per-org fetch), not via a new RPC — Doc 01 §1.5's RLS
 * predicates already scope every one of these tables correctly per-row, so
 * there's no cross-org/cross-tenant leak risk in doing this from the
 * client, and a new SECURITY DEFINER function would just be duplicating
 * logic these queries already express directly.
 *
 * "Dépenses" reuses expenses.tsx's exact consumed-total definition
 * (all-time sum of project_expenses vs. budget_total, advances
 * deliberately excluded — Doc 01 §1.14.2) so the same project never shows
 * two different "% consumed" figures on two different screens.
 */
interface ProjectRollupRow extends Project {
  consumedTotal: number;
  workersToday: number;
  pendingMaterials: number;
}

const STATUS_BADGE: Record<
  ProjectStatus,
  { variant: 'success' | 'info' | 'neutral'; label: string }
> = {
  active: { variant: 'success', label: 'En cours' },
  completed: { variant: 'info', label: 'Terminé' },
  archived: { variant: 'neutral', label: 'Archivé' },
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ProjectRollupScreen() {
  const [rows, setRows] = useState<ProjectRollupRow[] | null>(null);
  const [checked, setChecked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setRows([]);
      setChecked(true);
      return;
    }

    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', orgId)
      .is('deleted_at', null)
      .order('status', { ascending: true }) // 'active' sorts before 'archived'/'completed'
      .order('name', { ascending: true });

    const today = isoDate(new Date());

    const built = await Promise.all(
      (projects ?? []).map(async (project): Promise<ProjectRollupRow> => {
        const [expensesRes, workersRes, materialsRes] = await Promise.all([
          supabase.from('project_expenses').select('amount').eq('project_id', project.id),
          supabase
            .from('dispatch_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('assignment_date', today),
          supabase
            .from('materials')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('status', 'pending'),
        ]);
        const consumedTotal = (expensesRes.data ?? []).reduce(
          (sum, e: { amount: number }) => sum + Number(e.amount),
          0,
        );
        return {
          ...(project as Project),
          consumedTotal,
          workersToday: workersRes.count ?? 0,
          pendingMaterials: materialsRes.count ?? 0,
        };
      }),
    );

    setRows(built);
    setChecked(true);
  }

  if (!checked || rows === null) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56} paddingHorizontal="$4">
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Chantiers
        </Text>
        <SkeletonCardList cards={3} />
      </YStack>
    );
  }

  if (rows.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={BuildingsIcon}
          illustration="under-construction"
          title="Aucun chantier"
          description="Les chantiers actifs de votre entreprise apparaîtront ici avec leur avancement financier et opérationnel."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingTop={56} paddingHorizontal="$4" gap="$3">
      <YStack marginBottom="$1">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Chantiers
        </Text>
        <Text fontSize={14} color="$neutral500">
          Vue d&apos;ensemble de tous les chantiers actifs de votre entreprise.
        </Text>
      </YStack>

      {rows.map((row) => {
        const consumedPercent =
          row.budget_total && row.budget_total > 0
            ? Math.min(100, Math.round((row.consumedTotal / row.budget_total) * 100))
            : null;
        const badge = STATUS_BADGE[row.status];

        return (
          <YStack
            key={row.id}
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$2.5"
          >
            <XStack justifyContent="space-between" alignItems="flex-start">
              <YStack flex={1} paddingRight="$2">
                <Text fontSize={16} fontWeight="600">
                  {row.name}
                </Text>
                {row.client_name && (
                  <Text fontSize={13} color="$neutral500">
                    {row.client_name}
                  </Text>
                )}
              </YStack>
              <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
            </XStack>

            {consumedPercent !== null ? (
              <YStack gap="$1">
                <XStack justifyContent="space-between">
                  <Text fontSize={12.5} color="$neutral500">
                    Budget consommé
                  </Text>
                  <NumericText fontSize={12.5} color="$neutral500">
                    {row.consumedTotal.toFixed(0)} / {row.budget_total!.toFixed(0)} TND (
                    {consumedPercent}%)
                  </NumericText>
                </XStack>
                <View height={6} borderRadius={999} backgroundColor="$neutral100" overflow="hidden">
                  <View
                    height={6}
                    borderRadius={999}
                    width={`${consumedPercent}%` as `${number}%`}
                    backgroundColor={consumedPercent >= 90 ? '$danger' : '$accent600'}
                  />
                </View>
              </YStack>
            ) : (
              <Text fontSize={12.5} color="$neutral500">
                Aucun budget défini
              </Text>
            )}

            <XStack gap="$4">
              <YStack>
                <NumericText fontSize={18} fontWeight="600">
                  {row.workersToday}
                </NumericText>
                <Text fontSize={12} color="$neutral500">
                  Travailleurs aujourd&apos;hui
                </Text>
              </YStack>
              <YStack>
                <NumericText
                  fontSize={18}
                  fontWeight="600"
                  color={row.pendingMaterials > 0 ? '$warning' : undefined}
                >
                  {row.pendingMaterials}
                </NumericText>
                <Text fontSize={12} color="$neutral500">
                  Demandes en attente
                </Text>
              </YStack>
            </XStack>
          </YStack>
        );
      })}
    </YStack>
  );
}

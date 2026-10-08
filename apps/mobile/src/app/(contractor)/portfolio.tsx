import { color } from '@dala/design-tokens';
import type { Project } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { BuildingsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { MoneyGate } from '@/components/ui/MoneyGate';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Icon3D } from '@/components/ui/Icon3D';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { getProjectTypeMeta } from '@/lib/projectTypeMeta';
import { supabase } from '@/lib/supabase';
import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/portfolio.tsx
 *
 * NEW in Phase 6 — Doc 02 §2.10 "Phase 6+" names "multi-project rollup
 * dashboards" as its own roadmap item, distinct from Phase 4's Vue
 * d'ensemble (Doc 02 §2.8a / Doc 03 §3.9a). Checked before building this,
 * same naming-collision discipline as every prior phase: Vue d'ensemble
 * rolls up ACROSS ORGANIZATIONS the account owns, one tile per org — it
 * has no per-project breakdown. This screen rolls up ACROSS PROJECTS
 * WITHIN one org — the two are genuinely different views, not the same
 * feature under two names.
 *
 * CONSOLIDATED, Phase 14 — this screen used to only show budget-consumed %
 * and this-month worker-days. `project-rollup.tsx` (also Phase 6, reachable
 * from a dashboard.tsx card) turned out to be an accidental duplicate: both
 * files' own headers claimed to satisfy this exact same one-line roadmap
 * item, built independently, and project-rollup.tsx's own header discusses
 * cross-checking against vue-ensemble.tsx/budget_rollup before writing it
 * but never once mentions this file — a genuine miss, confirmed by reading
 * both files' git history and nav wiring (PlusSheet.tsx → here,
 * dashboard.tsx's card → project-rollup.tsx, both added the same phase),
 * not an intentional two-screen design. Consolidated to this file — the
 * more established of the two (already correctly reading
 * `attendance_effective`, Doc 02 §2.10's roadmap wording matches this
 * screen's name) — carrying forward project-rollup.tsx's two additional
 * metrics (workers dispatched today, pending materials requests) alongside
 * this screen's existing two (budget consumed %, worker-days this month).
 * `project-rollup.tsx` itself is deleted this phase; dashboard.tsx's card
 * now points here instead. See Doc 00 §0.5 #27 for the decision record.
 *
 * Read-only. `projects.tsx` (the mobile CRUD screen for projects) has been
 * a real screen since Phase 7 — this screen doesn't depend on it either
 * way, since project rows are readable here under ordinary RLS
 * (`is_org_member`) regardless of which surface created them.
 *
 * SCOPE: per-project budget-consumed % (from project_expenses), this-month
 * worker-days (from attendance_effective, migration 0036 as of Phase 13 —
 * was raw attendance_records, which double-counted a day when both a
 * manual and a dispatch row existed for the same worker/date; see 0036's
 * header for the full audit), workers dispatched today (from
 * dispatch_assignments, filtered to today's date), and pending materials
 * requests (from materials, status = 'pending') — four figures already
 * computed elsewhere in this repo (generate-report's progressionReport
 * uses the same attendance/expense queries, also fixed Phase 13), reused
 * here rather than inventing new metrics. A fuller portfolio view
 * (timeline, per-project drill-down beyond these four numbers) is future
 * work.
 */
type ProjectRollup = Project & {
  totalExpenses: number;
  workerDaysThisMonth: number;
  workersToday: number;
  pendingMaterials: number;
};

const STATUS_LABELS: Record<
  Project['status'],
  { label: string; variant: 'success' | 'neutral' | 'info' }
> = {
  active: { label: 'Actif', variant: 'success' },
  completed: { label: 'Terminé', variant: 'info' },
  archived: { label: 'Archivé', variant: 'neutral' },
};

function firstOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function PortfolioScreenContent() {
  const tc = useTokenColor();
  const [rollups, setRollups] = useState<ProjectRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Phase 20 (§1.7a) — same fix as billing/client-portal/vue-ensemble:
  // the primary projects fetch's error wasn't captured, so a failed fetch
  // and a genuinely-empty portfolio previously rendered identically.
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
      setRollups([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', orgId)
      .is('deleted_at', null)
      .in('status', ['active', 'completed'])
      .order('name');
    if (projectsError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const monthStart = firstOfMonthISO();
    const today = todayISO();

    const withRollups: ProjectRollup[] = await Promise.all(
      (projects ?? []).map(async (project) => {
        const [
          { data: expenses },
          { count: workerDays },
          { count: workersToday },
          { count: pendingMaterials },
        ] = await Promise.all([
          supabase.from('project_expenses').select('amount').eq('project_id', project.id),
          supabase
            .from('attendance_effective')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('status', 'present')
            .gte('record_date', monthStart),
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
        const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
        return {
          ...project,
          totalExpenses,
          workerDaysThisMonth: workerDays ?? 0,
          workersToday: workersToday ?? 0,
          pendingMaterials: pendingMaterials ?? 0,
        };
      }),
    );

    setRollups(withRollups);
    setLoading(false);
    setRefreshing(false);
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

  if (rollups.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={BuildingsIcon}
          illustration="investor-update"
          title="Aucun chantier actif"
          description="Le portefeuille regroupe le budget et l'activité de tous vos chantiers actifs et terminés."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <XStack alignItems="center" gap="$2">
          <Icon3D name="apartment-building" size={40} />
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Portefeuille
          </Text>
        </XStack>
        <Text fontSize={13} color="$neutral500" marginTop="$1">
          Budget et activité de tous vos chantiers.
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
          {rollups.map((p) => {
            const budgetTotal = p.budget_total ?? 0;
            const pctConsumed =
              budgetTotal > 0 ? Math.min(100, (p.totalExpenses / budgetTotal) * 100) : null;
            // UI/UX pass — the card's stat-grid shape (two-column metrics
            // + progress bar) genuinely differs from `ListCard`'s
            // scannable-row shape, so it stays a custom card rather than
            // being forced onto ListCard — but it picks up the same
            // project-type icon chip as Chantiers (projectTypeMeta.ts)
            // for visual consistency across the two screens that both
            // represent projects.
            const typeMeta = getProjectTypeMeta(p.project_type);
            const TypeIcon = typeMeta.icon;
            const chipTint = tc[typeMeta.colorKey];
            return (
              <YStack
                key={p.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                gap="$2"
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <XStack gap="$3" alignItems="center" flex={1}>
                    <View
                      width={36}
                      height={36}
                      borderRadius={10}
                      alignItems="center"
                      justifyContent="center"
                      backgroundColor={toRgba(chipTint, 0.14)}
                    >
                      <TypeIcon size={18} weight="fill" color={chipTint} />
                    </View>
                    <Text fontSize={15.5} fontWeight="600" flex={1} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </XStack>
                  <StatusBadge variant={STATUS_LABELS[p.status].variant}>
                    {STATUS_LABELS[p.status].label}
                  </StatusBadge>
                </XStack>

                {pctConsumed !== null ? (
                  <YStack gap="$1">
                    <XStack justifyContent="space-between">
                      <Text fontSize={12.5} color="$neutral500">
                        Budget consommé
                      </Text>
                      <NumericText fontSize={12.5} color="$neutral500">
                        {`${p.totalExpenses.toFixed(0)} / ${budgetTotal.toFixed(0)} TND (${pctConsumed.toFixed(0)}%)`}
                      </NumericText>
                    </XStack>
                    <YStack
                      height={6}
                      borderRadius={3}
                      backgroundColor="$neutral100"
                      overflow="hidden"
                    >
                      <YStack
                        height={6}
                        borderRadius={3}
                        backgroundColor={pctConsumed >= 90 ? '$danger' : '$accent600'}
                        width={`${pctConsumed}%`}
                      />
                    </YStack>
                  </YStack>
                ) : (
                  <Text fontSize={12.5} color="$neutral500">
                    Aucun budget renseigné pour ce chantier.
                  </Text>
                )}

                <XStack gap="$4">
                  <YStack>
                    <NumericText fontSize={16} fontWeight="600">
                      {p.workersToday}
                    </NumericText>
                    <Text fontSize={12} color="$neutral500">
                      Travailleurs aujourd&apos;hui
                    </Text>
                  </YStack>
                  <YStack>
                    <NumericText
                      fontSize={16}
                      fontWeight="600"
                      color={p.pendingMaterials > 0 ? '$warning' : undefined}
                    >
                      {p.pendingMaterials}
                    </NumericText>
                    <Text fontSize={12} color="$neutral500">
                      Demandes en attente
                    </Text>
                  </YStack>
                </XStack>

                <Text fontSize={12.5} color="$neutral500">
                  {`${p.workerDaysThisMonth} jour(s)-travailleur ce mois-ci`}
                </Text>
              </YStack>
            );
          })}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

/**
 * Viewers (Observateur) are money-blind since migration 0103 — see MoneyGate.
 */
export default function PortfolioScreen() {
  return (
    <MoneyGate title="Portefeuille">
      <PortfolioScreenContent />
    </MoneyGate>
  );
}

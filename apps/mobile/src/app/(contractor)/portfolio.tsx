import type { Project } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { BuildingsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

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
 * Read-only. `projects.tsx` (the mobile CRUD screen for projects) is
 * still an unbuilt stub as of this phase — but that doesn't block this
 * screen, since project rows are already created via the web app and
 * readable here under ordinary RLS (`is_org_member`), same as any other
 * org-scoped table. This screen doesn't need mobile-side project CRUD to
 * exist to be useful.
 *
 * SCOPE: per-project budget-consumed % (from project_expenses) and
 * this-month worker-days (from attendance_records) — the two figures
 * already computed elsewhere in this repo (generate-report's
 * progressionReport uses the same two queries), reused here rather than
 * inventing new metrics. A fuller portfolio view (timeline, per-project
 * drill-down beyond these two numbers) is future work.
 */
type ProjectRollup = Project & {
  totalExpenses: number;
  workerDaysThisMonth: number;
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

export default function PortfolioScreen() {
  const [rollups, setRollups] = useState<ProjectRollup[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setRollups([]);
      setLoading(false);
      return;
    }

    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', orgId)
      .is('deleted_at', null)
      .in('status', ['active', 'completed'])
      .order('name');

    const monthStart = firstOfMonthISO();

    const withRollups: ProjectRollup[] = await Promise.all(
      (projects ?? []).map(async (project) => {
        const [{ data: expenses }, { count: workerDays }] = await Promise.all([
          supabase.from('project_expenses').select('amount').eq('project_id', project.id),
          supabase
            .from('attendance_records')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', project.id)
            .eq('status', 'present')
            .gte('record_date', monthStart),
        ]);
        const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
        return { ...project, totalExpenses, workerDaysThisMonth: workerDays ?? 0 };
      }),
    );

    setRollups(withRollups);
    setLoading(false);
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (rollups.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={BuildingsIcon}
          illustration="mobile-analytics"
          title="Aucun chantier actif"
          description="Le portefeuille regroupe le budget et l'activité de tous vos chantiers actifs et terminés."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Portefeuille
        </Text>
        <Text fontSize={13} color="$neutral500" marginTop="$1">
          Budget et activité de tous vos chantiers.
        </Text>
      </YStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        <YStack gap="$2">
          {rollups.map((p) => {
            const budgetTotal = p.budget_total ?? 0;
            const pctConsumed =
              budgetTotal > 0 ? Math.min(100, (p.totalExpenses / budgetTotal) * 100) : null;
            return (
              <YStack
                key={p.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                gap="$2"
              >
                <XStack justifyContent="space-between" alignItems="center">
                  <Text fontSize={15.5} fontWeight="600">
                    {p.name}
                  </Text>
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

import { useFocusEffect } from 'expo-router';
import { GlobeHemisphereWestIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { listOwnedOrganizations, type MyOrgSummary } from '@/lib/myOrgs';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/vue-ensemble.tsx
 *
 * Doc 02 §2.8a — cross-org rollup for accounts that own more than one
 * organization. "Every org the user OWNS... active projects, this week's
 * advances, tomorrow's dispatch status, pending request counts — each
 * figure independently fetched per org and composed in the UI, never
 * blended into one cross-tenant number."
 *
 * That "never blended" instruction is why this fetches N times (once per
 * owned org) and renders N cards, instead of one query with an `in
 * (org_ids)` filter and a client-side groupBy — a single query summed
 * client-side is still, structurally, one cross-tenant read; RLS would
 * allow it (is_org_member is true for each owned org), but the spec's
 * explicit "never blended" is about the OUTPUT shape, not just about
 * bypassing RLS, so the fetches stay separated per org end to end.
 *
 * No stub existed for this screen before Phase 4; reached only from the
 * org-switcher sheet's "Vue d'ensemble" row (see OrgSwitcherSheet's own
 * comment for why that placement over a Dashboard mode or a Settings
 * entry — Settings isn't a built screen yet either).
 */
interface OrgRollup {
  org: MyOrgSummary;
  activeProjects: number;
  weekAdvancesTotal: number;
  dispatchPlannedTomorrow: boolean;
  pendingRequests: number;
}

export default function VueEnsembleScreen() {
  const [loading, setLoading] = useState(true);
  const [rollups, setRollups] = useState<OrgRollup[]>([]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const owned = await listOwnedOrganizations();

    const results = await Promise.all(owned.map((org) => fetchOrgRollup(org)));
    setRollups(results);
    setLoading(false);
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonCardList cards={2} />
      </YStack>
    );
  }

  if (rollups.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={GlobeHemisphereWestIcon}
          illustration="global-team"
          title="Aucune vue d'ensemble à afficher"
          description="Vue d'ensemble compare les entreprises que vous possédez — vous n'en possédez qu'une pour le moment."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
          Vue d&apos;ensemble
        </Text>
        <Text fontSize={13.5} color="$neutral500" marginBottom="$4">
          {rollups.length} entreprises que vous possédez
        </Text>

        <YStack gap="$3">
          {rollups.map((r) => (
            <YStack
              key={r.org.org_id}
              backgroundColor="$neutral0"
              borderRadius="$card"
              padding="$4"
              gap="$3"
            >
              <Text fontSize={16} fontWeight="600">
                {r.org.name}
              </Text>

              <XStack justifyContent="space-between">
                <StatBlock label="Chantiers actifs" value={String(r.activeProjects)} />
                <StatBlock
                  label="Avances (7 j)"
                  value={
                    <NumericText fontSize={17} fontWeight="600">
                      {r.weekAdvancesTotal.toFixed(0)} TND
                    </NumericText>
                  }
                />
              </XStack>
              <XStack justifyContent="space-between">
                <StatBlock
                  label="Demain"
                  value={r.dispatchPlannedTomorrow ? 'Planifié' : 'Non planifié'}
                />
                <StatBlock label="Demandes en attente" value={String(r.pendingRequests)} />
              </XStack>
            </YStack>
          ))}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function StatBlock({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <YStack flex={1}>
      <Text fontSize={12.5} color="$neutral500">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text fontSize={17} fontWeight="600" marginTop="$1">
          {value}
        </Text>
      ) : (
        <YStack marginTop="$1">{value}</YStack>
      )}
    </YStack>
  );
}

async function fetchOrgRollup(org: MyOrgSummary): Promise<OrgRollup> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);

  const [projectsRes, advancesRes, dispatchRes, materialsRes, workerAdvancesRes] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('lead_org_id', org.org_id)
        .is('deleted_at', null)
        .eq('status', 'active'),
      supabase
        .from('advances')
        .select('amount')
        .eq('org_id', org.org_id)
        .gte('created_at', weekAgo),
      supabase
        .from('dispatch_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.org_id)
        .eq('assignment_date', tomorrowDateStr),
      supabase
        .from('materials')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.org_id)
        .eq('status', 'pending'),
      supabase
        .from('advances')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.org_id)
        .eq('status', 'pending'),
    ]);

  const weekAdvancesTotal = (advancesRes.data ?? []).reduce(
    (sum, row: any) => sum + (row.amount ?? 0),
    0,
  );

  return {
    org,
    activeProjects: projectsRes.count ?? 0,
    weekAdvancesTotal,
    dispatchPlannedTomorrow: (dispatchRes.count ?? 0) > 0,
    pendingRequests: (materialsRes.count ?? 0) + (workerAdvancesRes.count ?? 0),
  };
}

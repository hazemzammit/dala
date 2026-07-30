import { color } from '@dala/design-tokens';
import type { Worker, WorkerLatenessPattern } from '@dala/shared-types';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, ChartLineUpIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { NumericText } from '@/components/ui/NumericText';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { supabase } from '@/lib/supabase';

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
 */
const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export default function WorkerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [patterns, setPatterns] = useState<WorkerLatenessPattern[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [id]),
  );

  async function load() {
    if (!id) return;
    setLoading(true);

    const [{ data: workerRow }, { data: latenessRows }] = await Promise.all([
      supabase.from('active_workers').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('get_worker_lateness_pattern', { p_worker_id: id }),
    ]);

    setWorker(workerRow ?? null);
    setPatterns((latenessRows as WorkerLatenessPattern[] | null) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
        <SkeletonList rows={4} />
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$2">
          <Text fontFamily="$display" fontSize={20} fontWeight="600">
            {worker.full_name}
          </Text>
          <Text fontSize={14} color="$neutral500">
            {worker.trade ?? 'Métier non renseigné'}
          </Text>
          <XStack gap="$2" marginTop="$2">
            {worker.phone && <StatusBadge variant="neutral">{worker.phone}</StatusBadge>}
            {worker.daily_rate != null && (
              <StatusBadge variant="info">{`${worker.daily_rate} TND/jour`}</StatusBadge>
            )}
          </XStack>
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
    </YStack>
  );
}

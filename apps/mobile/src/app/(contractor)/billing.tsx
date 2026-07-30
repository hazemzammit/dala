import type { Organization } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { ReceiptIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { NumericText } from '@/components/ui/NumericText';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { getOrgStorageUsageBytes, STORAGE_FREE_TIER_LIMIT_BYTES } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/billing.tsx
 *
 * Doc 03 §3.21 "Billing & subscription" — built out this phase (was an
 * empty-state stub). Checked before writing: organizations.plan is a bare
 * `text` column (default 'free'), no subscription table, no Konnect (or any
 * payment processor) integration anywhere in migrations or Edge Functions.
 * That's confirmed still true, not assumed.
 *
 * SCOPE SPLIT, stated plainly:
 *   - What's honestly buildable from the mobile side alone: a read-only
 *     "your current plan" card against the existing `plan` field. That's
 *     what this screen does.
 *   - What is NOT buildable here without a real product decision: an
 *     actual checkout/upgrade flow. Doc 03 §3.21 already names Konnect as
 *     the processor, which is useful (it's not mine to invent), but
 *     wiring it needs API keys, a webhook-receiving Edge Function, and a
 *     real subscriptions table with a lifecycle (trial/active/past_due/
 *     canceled) — a backend integration task, not a UI-polish one. STILL
 *     TRUE as of Phase 6 — confirmed no Konnect sandbox credentials exist
 *     before touching this file again. The "Passer à Pro" button below
 *     remains present but intentionally inert with an honest message,
 *     rather than faking a checkout flow that doesn't process a real
 *     payment.
 *   - Phase 6 ADDITION: the storage-usage bar cut in Phase 5 (Doc 01
 *     §1.6's 1GB free-tier limit) — `getOrgStorageUsageBytes()`
 *     (lib/storage.ts) now does the recursive org-files listing this
 *     needed. Loaded independently of the plan-card fetch (separate
 *     loading state) since it's a slower, multi-request call and
 *     shouldn't block the plan card from rendering first.
 */
const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit',
  pro: 'Pro',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`;
}

export default function BillingScreen() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const orgId = await getActiveOrgId();
    if (!orgId) {
      setLoading(false);
      setStorageLoading(false);
      return;
    }
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
    setOrg(data);
    setLoading(false);

    // Separate loading state, deliberately not awaited above — the
    // recursive org-files listing is slower and shouldn't block the plan
    // card from rendering first.
    setStorageLoading(true);
    void getOrgStorageUsageBytes(orgId).then((bytes) => {
      setStorageBytes(bytes);
      setStorageLoading(false);
    });
  }

  function handleUpgradePress() {
    Alert.alert(
      'Bientôt disponible',
      "La mise à niveau vers le plan Pro (paiement Konnect) n'est pas encore disponible dans l'application.",
    );
  }

  if (loading) return null;

  if (!org) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={ReceiptIcon}
          illustration="receipt"
          title="Aucune facture pour le moment"
          description="Générez une facture à partir des jalons d'un chantier — elle apparaîtra ici, prête à envoyer par WhatsApp ou e-mail."
        />
      </YStack>
    );
  }

  const planLabel = PLAN_LABELS[org.plan] ?? org.plan;

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Facturation
        </Text>

        <YStack
          backgroundColor="$neutral0"
          borderRadius="$card"
          padding="$4"
          gap="$2"
          marginBottom="$4"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize={15.5} fontWeight="600">
              Plan actuel
            </Text>
            <StatusBadge variant={org.plan === 'pro' ? 'success' : 'neutral'}>
              {planLabel}
            </StatusBadge>
          </XStack>
          {org.plan === 'free' && (
            <Text fontSize={13} color="$neutral500">
              1 Go de stockage inclus (photos, notes vocales, documents). Le plan Pro lève cette
              limite.
            </Text>
          )}
        </YStack>

        {org.plan === 'free' && (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$2"
            marginBottom="$4"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={14} fontWeight="500">
                Stockage utilisé
              </Text>
              {!storageLoading && storageBytes !== null && (
                <NumericText fontSize={13} color="$neutral500">
                  {formatBytes(storageBytes)} / 1 Go
                </NumericText>
              )}
            </XStack>
            {storageLoading ? (
              <YStack height={8} borderRadius={999} backgroundColor="$neutral100" />
            ) : storageBytes !== null ? (
              <>
                <View height={8} borderRadius={999} backgroundColor="$neutral100" overflow="hidden">
                  <View
                    height={8}
                    borderRadius={999}
                    width={
                      `${Math.min(100, (storageBytes / STORAGE_FREE_TIER_LIMIT_BYTES) * 100)}%` as `${number}%`
                    }
                    backgroundColor={
                      storageBytes / STORAGE_FREE_TIER_LIMIT_BYTES >= 0.9 ? '$danger' : '$accent600'
                    }
                  />
                </View>
                {storageBytes / STORAGE_FREE_TIER_LIMIT_BYTES >= 0.9 && (
                  <Text fontSize={12.5} color="$danger">
                    Stockage presque plein — le plan Pro lève la limite de 1 Go.
                  </Text>
                )}
              </>
            ) : (
              <Text fontSize={12.5} color="$neutral500">
                Impossible de calculer l&apos;utilisation du stockage pour le moment.
              </Text>
            )}
          </YStack>
        )}

        {org.plan === 'free' && (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$2"
            marginBottom="$4"
            onPress={handleUpgradePress}
          >
            <Text fontSize={15.5} fontWeight="600" color="$accent600">
              Passer à Pro
            </Text>
            <Text fontSize={13} color="$neutral500">
              Paiement via Konnect (Doc 03 §3.21) — intégration à venir.
            </Text>
          </YStack>
        )}

        <EmptyState
          icon={ReceiptIcon}
          illustration="receipt"
          title="Aucune facture pour le moment"
          description="Générez une facture à partir des jalons d'un chantier — elle apparaîtra ici, prête à envoyer par WhatsApp ou e-mail."
        />
      </ScrollView>
    </YStack>
  );
}

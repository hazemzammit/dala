import { color } from '@dala/design-tokens';
import type { Organization } from '@dala/shared-types';
import { useFocusEffect } from 'expo-router';
import { ReceiptIcon, WarningIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
import { NumericText } from '@/components/ui/NumericText';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
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
 *
 * PHASE 22 ADDITIONS (Priority 8): Phase 17 built `billing_cycles`
 * (migration 0043) and free-tier enforcement off `subscription_status`
 * (migration 0044), but this screen never read either — confirmed by
 * grepping the file before this session: zero references to
 * `subscription_status` or `billing_cycles` anywhere in it. Two things
 * added:
 *   1. A billing-history list against real `billing_cycles` rows (date
 *      range, seat count, amount, status), read via the existing
 *      owner/manager-only RLS policy (0043) — no new policy needed. This
 *      is a DIFFERENT concept from the "Aucune facture" empty state
 *      already at the bottom of this screen, which is about
 *      milestone-generated CLIENT invoices (Doc 03 §3.10.3a's Dépenses
 *      area, still unbuilt) — left untouched, not merged with this.
 *   2. A past-due state card, shown only when `subscription_status =
 *      'past_due'`, spelling out the exact caps migration 0044 enforces
 *      (3 active projects, 3 roster workers, no multi-org collaboration)
 *      rather than leaving the contractor to discover them one
 *      `feature_requires_active_subscription` error at a time. This is
 *      IN ADDITION to the new app-wide `PastDueBanner` (mounted in
 *      `(contractor)/_layout.tsx`) — the banner is the proactive,
 *      always-visible nudge across every screen; this card is the
 *      detailed explanation once the contractor has actually navigated
 *      here to find out why.
 */

/**
 * `organizations` gained `subscription_status`/`billing_cycle_start`/
 * `seat_price_millimes` in migration 0043 (Phase 17), but
 * `@dala/shared-types`' `Organization` interface was never updated to
 * include them (confirmed by reading packages/shared-types/src/index.ts
 * directly). `packages/shared-types` is shared with apps/admin and
 * apps/web, both explicitly out of scope for this phase — extending the
 * shared interface risks touching their type-checking even though this
 * phase's brief is `apps/mobile` only, so the three columns are typed
 * locally instead, scoped to this file. A future phase touching
 * shared-types itself should fold this into the real interface.
 */
type OrgWithBilling = Organization & {
  subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
  seat_price_millimes: number;
};

type BillingCycleStatus = 'pending' | 'paid' | 'failed' | 'expired';

interface BillingCycleRow {
  id: string;
  cycle_start: string;
  cycle_end: string;
  seat_count: number;
  amount_millimes: number;
  status: BillingCycleStatus;
  paid_at: string | null;
}

const BILLING_CYCLE_STATUS_LABELS: Record<
  BillingCycleStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  pending: { label: 'En attente', variant: 'warning' },
  paid: { label: 'Payé', variant: 'success' },
  failed: { label: 'Échoué', variant: 'danger' },
  expired: { label: 'Expiré', variant: 'neutral' },
};

function formatMillimesTND(millimes: number): string {
  return `${(millimes / 1000).toFixed(0)} TND`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-TN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuit',
  pro: 'Pro',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`;
}

export default function BillingScreen() {
  const toast = useToast();
  const [org, setOrg] = useState<OrgWithBilling | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [cycles, setCycles] = useState<BillingCycleRow[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);

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
      setCyclesLoading(false);
      return;
    }
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
    setOrg(data as OrgWithBilling | null);
    setLoading(false);

    // Separate loading state, deliberately not awaited above — the
    // recursive org-files listing is slower and shouldn't block the plan
    // card from rendering first.
    setStorageLoading(true);
    void getOrgStorageUsageBytes(orgId).then((bytes) => {
      setStorageBytes(bytes);
      setStorageLoading(false);
    });

    // Same "don't block the plan card" reasoning as the storage fetch
    // above — a third independent loading state for a third independent
    // query.
    setCyclesLoading(true);
    void supabase
      .from('billing_cycles')
      .select('id, cycle_start, cycle_end, seat_count, amount_millimes, status, paid_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data: cycleRows }) => {
        setCycles((cycleRows ?? []) as BillingCycleRow[]);
        setCyclesLoading(false);
      });
  }

  function handleUpgradePress() {
    toast.info(
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
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Facturation
        </Text>

        {org.subscription_status === 'past_due' && (
          <YStack
            backgroundColor="rgba(192, 67, 61, 0.08)"
            borderRadius="$card"
            padding="$4"
            gap="$2"
            marginBottom="$4"
            borderWidth={1}
            borderColor="rgba(192, 67, 61, 0.25)"
          >
            <XStack alignItems="center" gap="$2">
              <WarningIcon size={18} color={color.status.danger} weight="fill" />
              <Text fontSize={15.5} fontWeight="600" color="$danger">
                Paiement en retard
              </Text>
            </XStack>
            <Text fontSize={13} color="$neutral500">
              Tant que le paiement n&apos;est pas régularisé, votre organisation est limitée à 3
              chantiers actifs, 3 ouvriers sur l&apos;effectif, et la collaboration multi-entreprise
              est désactivée. Les données existantes restent accessibles.
            </Text>
          </YStack>
        )}

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

        <Text fontSize={15.5} fontWeight="600" marginBottom="$2">
          Historique de facturation
        </Text>

        {cyclesLoading ? (
          <YStack
            height={64}
            borderRadius="$card"
            backgroundColor="$neutral100"
            marginBottom="$4"
          />
        ) : cycles.length === 0 ? (
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" marginBottom="$4">
            <Text fontSize={13} color="$neutral500">
              Aucun cycle de facturation généré pour le moment.
            </Text>
          </YStack>
        ) : (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            marginBottom="$4"
            overflow="hidden"
          >
            {cycles.map((cycle, index) => {
              const statusMeta = BILLING_CYCLE_STATUS_LABELS[cycle.status];
              return (
                <YStack
                  key={cycle.id}
                  padding="$4"
                  gap="$1"
                  borderTopWidth={index === 0 ? 0 : 1}
                  borderTopColor="$neutral100"
                >
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={14} fontWeight="500">
                      {formatDate(cycle.cycle_start)} – {formatDate(cycle.cycle_end)}
                    </Text>
                    <StatusBadge variant={statusMeta.variant}>{statusMeta.label}</StatusBadge>
                  </XStack>
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontSize={12.5} color="$neutral500">
                      {cycle.seat_count} {cycle.seat_count > 1 ? 'sièges' : 'siège'}
                    </Text>
                    <NumericText fontSize={14} fontWeight="600">
                      {formatMillimesTND(cycle.amount_millimes)}
                    </NumericText>
                  </XStack>
                </YStack>
              );
            })}
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

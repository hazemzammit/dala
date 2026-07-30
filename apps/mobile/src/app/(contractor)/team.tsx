import { color } from '@dala/design-tokens';
import type { Worker, WorkerInvitation } from '@dala/shared-types';
import { inviteWorkerSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import { PlusIcon, TrashIcon, UsersIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/team.tsx
 *
 * Doc 03 §3.13 — worker list + invite flow. A worker's row-level status is
 * derived, not stored: `workers.user_id` set → "Actif"; a `pending`
 * `worker_invitations` row and no `user_id` → "Invitation en attente"; an
 * `expired` invitation and no `user_id` → treated as "Inactif" with a
 * re-invite action, matching Doc 03 §3.13's re-send-updates-the-existing-row
 * rule (never a duplicate invite row for the same worker).
 *
 * Pointage (manual attendance) is also reachable via the header link below,
 * in addition to the Plus sheet — it's used often enough alongside roster
 * management that a second, closer entry point is worth the minor
 * duplication.
 *
 * Phase 5 additions (migration 0025, Doc 02 §2.10 Trash / §2.2 Tier 0):
 *   - queries `active_workers` instead of `workers` directly, so a
 *     soft-deleted worker drops off this list immediately rather than
 *     waiting for a client-side filter (same view-based pattern
 *     `active_projects` already established in 0013).
 *   - each row now has a delete affordance (soft_delete_worker RPC) — Trash
 *     screen needs a real entry point to soft-delete FROM, and this is the
 *     only fully-built worker screen to put it on.
 *   - tapping a row (rather than its delete icon) opens the new Worker
 *     Detail screen (`worker/[id].tsx`) for Tier 0 lateness surfacing.
 */
type DerivedStatus = 'active' | 'pending' | 'inactive';

interface WorkerRow extends Worker {
  invitation: WorkerInvitation | null;
}

const STATUS_BADGE: Record<
  DerivedStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  active: { label: 'Actif', variant: 'success' },
  pending: { label: 'Invitation en attente', variant: 'warning' },
  inactive: { label: 'Inactif', variant: 'neutral' },
};

function deriveStatus(row: WorkerRow): DerivedStatus {
  if (row.user_id) return 'active';
  if (row.invitation?.status === 'pending') return 'pending';
  return 'inactive';
}

export default function TeamScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [channel, setChannel] = useState<'app' | 'whatsapp' | 'sms'>('whatsapp');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }

    const { data: workerRows } = await supabase
      .from('active_workers')
      .select('*')
      .eq('org_id', org)
      .order('full_name');

    const ids = (workerRows ?? []).map((w) => w.id);
    const { data: invitations } = ids.length
      ? await supabase.from('worker_invitations').select('*').in('worker_id', ids)
      : { data: [] as WorkerInvitation[] };

    const merged: WorkerRow[] = (workerRows ?? []).map((w) => ({
      ...w,
      invitation:
        (invitations ?? [])
          .filter((i) => i.worker_id === w.id)
          .sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1))[0] ?? null,
    }));

    setWorkers(merged);
    setLoading(false);
  }

  function openInvite() {
    setFullName('');
    setEmail('');
    setPhone('');
    setTrade('');
    setDailyRate('');
    setChannel('whatsapp');
    setError(null);
    setSheetOpen(true);
  }

  async function handleInvite() {
    setError(null);
    if (!orgId) return;

    const parsed = inviteWorkerSchema.safeParse({
      full_name: fullName,
      email,
      phone,
      trade: trade || undefined,
      daily_rate: dailyRate ? Number(dailyRate) : undefined,
      channel,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      // Doc 03 §3.13 — re-sending an expired invite updates the existing
      // worker_invitations row rather than creating a duplicate, and a new
      // worker gets a fresh `workers` row first. Both steps, plus a
      // cryptographically-secure token, happen server-side in one call
      // (migration 0018) rather than as several client round-trips — see
      // that migration's comment for why the token specifically can't be
      // generated here.
      const { error: rpcError } = await supabase.rpc('invite_worker', {
        p_org_id: orgId,
        p_full_name: parsed.data.full_name,
        p_email: parsed.data.email,
        p_phone: parsed.data.phone,
        p_trade: parsed.data.trade ?? null,
        p_daily_rate: parsed.data.daily_rate ?? null,
        p_channel: parsed.data.channel,
      });
      if (rpcError) throw rpcError;

      // Sending the actual WhatsApp/SMS/app notification carrying the
      // `dala://accept-invite?token=...` link is a backend/notification-
      // service concern (Doc 02's notification dispatch, not built yet in
      // this pass) — the invitation row existing is what the accept-invite
      // screen and the roster's "pending" badge both depend on today.
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  async function handleResend(row: WorkerRow) {
    if (!orgId || !row.email) return;
    const { error: rpcError } = await supabase.rpc('invite_worker', {
      p_org_id: orgId,
      p_full_name: row.full_name,
      p_email: row.email,
      p_phone: row.phone,
      p_trade: row.trade,
      p_daily_rate: row.daily_rate,
      p_channel: row.invitation?.channel ?? 'whatsapp',
    });
    if (rpcError) {
      Alert.alert('Erreur', "Impossible de renvoyer l'invitation.");
      return;
    }
    Alert.alert('Invitation renvoyée', `Un nouveau lien a été généré pour ${row.full_name}.`);
    await load();
  }

  function confirmDelete(row: WorkerRow) {
    Alert.alert(
      'Supprimer ce travailleur ?',
      `${row.full_name} sera déplacé vers la corbeille et restaurable pendant 30 jours.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => void handleDelete(row) },
      ],
    );
  }

  async function handleDelete(row: WorkerRow) {
    const { error: rpcError } = await supabase.rpc('soft_delete_worker', {
      p_worker_id: row.id,
    });
    if (rpcError) {
      Alert.alert('Erreur', 'Impossible de supprimer ce travailleur.');
      haptics.error();
      return;
    }
    haptics.confirm();
    await load();
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={5} />
      </YStack>
    );
  }

  if (workers.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={UsersIcon}
          illustration="team"
          title="Aucun travailleur"
          description="Invitez votre équipe pour commencer à planifier vos dispatchs. Utilisez le bouton + ci-dessous."
        />
        <FAB icon={PlusIcon} accessibilityLabel="Inviter un travailleur" onPress={openInvite} />
        {renderSheet()}
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$4">
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Équipe
          </Text>
          <Text
            color="$accent600"
            fontSize={14}
            fontWeight="500"
            onPress={() => router.push('/pointage')}
          >
            Pointage
          </Text>
        </XStack>

        <YStack gap="$2">
          {workers.map((worker) => {
            const derived = deriveStatus(worker);
            return (
              <XStack
                key={worker.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                justifyContent="space-between"
                alignItems="center"
                onPress={() => router.push(`/worker/${worker.id}` as never)}
              >
                <XStack gap="$3" alignItems="center" flex={1}>
                  <Avatar name={worker.full_name} />
                  <YStack gap="$1" flex={1}>
                    <Text fontSize={15.5} fontWeight="600">
                      {worker.full_name}
                    </Text>
                    <Text fontSize={13} color="$neutral500">
                      {worker.trade ?? '—'}
                    </Text>
                  </YStack>
                </XStack>
                <XStack alignItems="center" gap="$3">
                  <YStack alignItems="flex-end" gap="$2">
                    <StatusBadge variant={STATUS_BADGE[derived].variant}>
                      {STATUS_BADGE[derived].label}
                    </StatusBadge>
                    {derived !== 'active' && (
                      <Text
                        fontSize={12}
                        color="$accent600"
                        onPress={(e: any) => {
                          e.stopPropagation?.();
                          handleResend(worker);
                        }}
                      >
                        Renvoyer l&apos;invitation
                      </Text>
                    )}
                  </YStack>
                  <XStack
                    padding={6}
                    onPress={(e: any) => {
                      e.stopPropagation?.();
                      confirmDelete(worker);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${worker.full_name}`}
                  >
                    <TrashIcon size={18} color={color.neutral[500]} />
                  </XStack>
                </XStack>
              </XStack>
            );
          })}
        </YStack>
      </ScrollView>

      <FAB icon={PlusIcon} accessibilityLabel="Inviter un travailleur" onPress={openInvite} />
      {renderSheet()}
    </YStack>
  );

  function renderSheet() {
    return (
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Inviter un travailleur">
        <YStack gap="$3">
          <FormField label="Nom complet" value={fullName} onChangeText={setFullName} />
          <FormField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <FormField label="Métier (optionnel)" value={trade} onChangeText={setTrade} />
          <FormField
            label="Taux journalier (TND, optionnel)"
            value={dailyRate}
            onChangeText={setDailyRate}
            keyboardType="numeric"
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Canal de notification
            </Text>
            <SegmentedControl
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'whatsapp', label: 'WhatsApp', color: '$accent600' },
                { value: 'sms', label: 'SMS', color: '$accent600' },
                { value: 'app', label: 'App', color: '$accent600' },
              ]}
            />
          </YStack>

          {error && <Text color="$danger">{error}</Text>}

          <Button onPress={handleInvite} loading={saving}>
            Envoyer l&apos;invitation
          </Button>
        </YStack>
      </Sheet>
    );
  }
}

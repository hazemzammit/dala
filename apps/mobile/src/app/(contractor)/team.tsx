import { color } from '@dala/design-tokens';
import type { Worker, WorkerInvitation } from '@dala/shared-types';
import { inviteWorkerSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import {
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Input, Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { TRADE_OPTIONS } from '@/lib/pickerOptions';
import { getSignedUrlMap } from '@/lib/storage';
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
 *
 * UI/UX pass: the roster was previously one flat list regardless of the
 * three derived statuses computed above — a manager scanning for "who
 * still hasn't accepted their invite" had to read every badge one by one.
 * Adds: grouped sections (Actifs/En attente/Inactifs) with per-section
 * counts, a headcount summary row, a name/trade search filter (parity with
 * `projects.tsx`'s own search bar), pull-to-refresh, and a `SwipeableRow`
 * delete action replacing the small standalone trash icon (kept the trash
 * icon too, inside the swipe reveal, rather than removing tap-precision
 * entirely for anyone who prefers it).
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

/** Per-field validation errors — same rationale as vehicles.tsx's
 * FieldErrors: replaces the previous single `error` string that only ever
 * showed `issues[0]`. */
interface FieldErrors {
  full_name?: string;
  email?: string;
  phone?: string;
  trade?: string;
  daily_rate?: string;
}

export default function TeamScreen() {
  const toast = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [trade, setTrade] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [channel, setChannel] = useState<'app' | 'whatsapp' | 'sms'>('whatsapp');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Themed ConfirmDialog replacing Alert.alert's destructive two-button variant.
  const [deleteTarget, setDeleteTarget] = useState<WorkerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Phase 3 §1.5/§4.1 — resolved-photo storage path per worker id (already
  // applying the profiles.avatar_url-over-workers.photo_url priority
  // documented in worker/[id].tsx), then a signed URL per distinct path.
  const [photoPathByWorkerId, setPhotoPathByWorkerId] = useState<Record<string, string>>({});
  const [photoUrlByPath, setPhotoUrlByPath] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
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
    setRefreshing(false);

    // Phase 3 — resolve each worker's display photo (linked profile's own
    // avatar_url first, falling back to workers.photo_url — same priority
    // as worker/[id].tsx) in one batched pass rather than per-row calls.
    const linkedUserIds = merged.filter((w) => w.user_id).map((w) => w.user_id as string);
    const { data: profileRows } = linkedUserIds.length
      ? await supabase.from('profiles').select('id, avatar_url').in('id', linkedUserIds)
      : { data: [] as { id: string; avatar_url: string | null }[] };
    const avatarByUserId: Record<string, string> = {};
    for (const p of profileRows ?? []) if (p.avatar_url) avatarByUserId[p.id] = p.avatar_url;

    const pathByWorkerId: Record<string, string> = {};
    for (const w of merged) {
      const path = (w.user_id && avatarByUserId[w.user_id]) || w.photo_url;
      if (path) pathByWorkerId[w.id] = path;
    }
    setPhotoPathByWorkerId(pathByWorkerId);
    setPhotoUrlByPath(await getSignedUrlMap(Object.values(pathByWorkerId)));
  }

  function openInvite() {
    setFullName('');
    setEmail('');
    setPhone('');
    setTrade('');
    setDailyRate('');
    setChannel('whatsapp');
    setFieldErrors({});
    setFormError(null);
    setSheetOpen(true);
  }

  async function handleInvite() {
    setFieldErrors({});
    setFormError(null);
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
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === 'full_name' ||
          key === 'email' ||
          key === 'phone' ||
          key === 'trade' ||
          key === 'daily_rate'
        ) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
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
      haptics.confirm();
      toast.success(`Invitation envoyée à ${parsed.data.full_name}.`);
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? 'Une erreur est survenue. Réessayez.');
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
      toast.error("Impossible de renvoyer l'invitation.");
      haptics.error();
      return;
    }
    toast.success(`Un nouveau lien a été généré pour ${row.full_name}.`);
    await load();
  }

  function confirmDelete(row: WorkerRow) {
    setDeleteTarget(row);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: rpcError } = await supabase.rpc('soft_delete_worker', {
      p_worker_id: deleteTarget.id,
    });
    setDeleting(false);
    if (rpcError) {
      toast.error('Impossible de supprimer ce travailleur.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Travailleur déplacé vers la corbeille.');
    setDeleteTarget(null);
    await load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) => w.full_name.toLowerCase().includes(q) || (w.trade ?? '').toLowerCase().includes(q),
    );
  }, [workers, query]);

  // IMPROVEMENT-PLAN PHASE 4 (§3, prefill/suggestion layer) — "a suggested
  // daily rate by trade when adding a worker... reading an average/
  // most-common daily_rate for workers sharing the same trade value, now
  // that trade is a closed list from item 2 above." Average, not mode —
  // simpler to compute correctly from a small in-memory roster and the
  // plan's own wording lists it first ("average/most-common"). Computed
  // from whatever's already loaded in `workers` (org-wide, not just the
  // currently-filtered/grouped view), no new query.
  const avgDailyRateByTrade = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    workers.forEach((w) => {
      if (!w.trade || w.daily_rate == null) return;
      const bucket = (sums[w.trade] ??= { total: 0, count: 0 });
      bucket.total += w.daily_rate;
      bucket.count += 1;
    });
    const result: Record<string, number> = {};
    for (const [t, { total, count }] of Object.entries(sums)) {
      result[t] = Math.round((total / count) * 100) / 100;
    }
    return result;
  }, [workers]);
  const suggestedDailyRate = trade ? (avgDailyRateByTrade[trade] ?? null) : null;

  const grouped = useMemo(() => {
    const active: WorkerRow[] = [];
    const pending: WorkerRow[] = [];
    const inactive: WorkerRow[] = [];
    filtered.forEach((w) => {
      const status = deriveStatus(w);
      if (status === 'active') active.push(w);
      else if (status === 'pending') pending.push(w);
      else inactive.push(w);
    });
    return [
      { key: 'active' as const, label: 'Actifs', rows: active },
      { key: 'pending' as const, label: 'En attente', rows: pending },
      { key: 'inactive' as const, label: 'Inactifs', rows: inactive },
    ].filter((g) => g.rows.length > 0);
  }, [filtered]);

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
        {renderDeleteConfirm()}
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Équipe
          </Text>
          <Text
            color="$accent600"
            fontSize={14}
            fontWeight="500"
            onPress={() => router.push('/pointage')}
            accessibilityRole="button"
            accessibilityLabel="Aller au pointage"
          >
            Pointage
          </Text>
        </XStack>

        {/* Headcount summary — was entirely absent; the roster's own three
            derived statuses (active/pending/inactive) had nowhere to
            surface as a total until now. */}
        <XStack
          backgroundColor="$neutral0"
          borderRadius="$card"
          padding="$3"
          marginBottom="$3"
          gap="$2"
        >
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600">
              {workers.length}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Travailleurs
            </Text>
          </YStack>
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$success">
              {workers.filter((w) => deriveStatus(w) === 'active').length}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              Actifs
            </Text>
          </YStack>
          <YStack flex={1} alignItems="center" gap={2}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" color="$warning">
              {workers.filter((w) => deriveStatus(w) === 'pending').length}
            </Text>
            <Text fontSize={11.5} color="$neutral500">
              En attente
            </Text>
          </YStack>
        </XStack>

        <XStack
          alignItems="center"
          gap="$2"
          backgroundColor="$neutral0"
          borderRadius="$control"
          paddingHorizontal={12}
          marginBottom="$4"
          borderWidth={1}
          borderColor="$neutral200"
        >
          <MagnifyingGlassIcon size={16} color={color.neutral[500]} />
          <Input
            flex={1}
            unstyled
            placeholder="Rechercher un travailleur ou un métier"
            placeholderTextColor={color.neutral[500]}
            value={query}
            onChangeText={setQuery}
            paddingVertical={10}
            fontSize={14.5}
          />
        </XStack>

        {grouped.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucun résultat pour « {query} ».
          </Text>
        ) : (
          <YStack gap="$4">
            {grouped.map((group) => (
              <YStack key={group.key} gap="$2">
                <XStack alignItems="center" gap="$2">
                  <Text
                    fontSize={13}
                    fontWeight="600"
                    color="$neutral500"
                    textTransform="uppercase"
                    letterSpacing={0.4}
                  >
                    {group.label}
                  </Text>
                  <Text fontSize={12} color="$neutral300">
                    ({group.rows.length})
                  </Text>
                </XStack>

                {group.rows.map((worker) => (
                  <SwipeableRow
                    key={worker.id}
                    rightAction={{
                      label: 'Supprimer',
                      color: color.status.danger,
                      icon: TrashIcon,
                      onPress: () => confirmDelete(worker),
                    }}
                  >
                    <XStack
                      backgroundColor="$neutral0"
                      borderRadius="$card"
                      padding="$4"
                      justifyContent="space-between"
                      alignItems="center"
                      onPress={() => router.push(`/worker/${worker.id}` as never)}
                    >
                      <XStack gap="$3" alignItems="center" flex={1}>
                        <Avatar
                          name={worker.full_name}
                          imageUrl={
                            photoPathByWorkerId[worker.id]
                              ? photoUrlByPath[photoPathByWorkerId[worker.id]]
                              : undefined
                          }
                        />
                        <YStack gap="$1" flex={1}>
                          <Text fontSize={15.5} fontWeight="600">
                            {worker.full_name}
                          </Text>
                          <Text fontSize={13} color="$neutral500">
                            {worker.trade ?? '—'}
                          </Text>
                        </YStack>
                      </XStack>
                      <YStack alignItems="flex-end" gap="$2">
                        <StatusBadge variant={STATUS_BADGE[deriveStatus(worker)].variant}>
                          {STATUS_BADGE[deriveStatus(worker)].label}
                        </StatusBadge>
                        {deriveStatus(worker) !== 'active' && (
                          <XStack
                            alignItems="center"
                            gap={4}
                            onPress={(e: any) => {
                              e.stopPropagation?.();
                              handleResend(worker);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Renvoyer l'invitation à ${worker.full_name}`}
                          >
                            <PaperPlaneTiltIcon size={12} color={color.accent[600]} />
                            <Text fontSize={12} color="$accent600" fontWeight="500">
                              Renvoyer
                            </Text>
                          </XStack>
                        )}
                      </YStack>
                    </XStack>
                  </SwipeableRow>
                ))}
              </YStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      <FAB icon={PlusIcon} accessibilityLabel="Inviter un travailleur" onPress={openInvite} />
      {renderSheet()}
      {renderDeleteConfirm()}
    </YStack>
  );

  function renderDeleteConfirm() {
    return (
      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Supprimer ce travailleur ?"
        description={
          deleteTarget
            ? `${deleteTarget.full_name} sera déplacé vers la corbeille et restaurable pendant 30 jours.`
            : undefined
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    );
  }

  function renderSheet() {
    return (
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Inviter un travailleur">
        <YStack gap="$3">
          <FormField
            label="Nom complet"
            value={fullName}
            onChangeText={setFullName}
            error={fieldErrors.full_name}
          />
          <FormField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={fieldErrors.email}
          />
          <FormField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            error={fieldErrors.phone}
          />
          <Select
            label="Métier (optionnel)"
            value={trade || null}
            onChange={setTrade}
            options={TRADE_OPTIONS}
            error={fieldErrors.trade}
          />
          <YStack gap="$1.5">
            <FormField
              label="Taux journalier (TND, optionnel)"
              value={dailyRate}
              onChangeText={setDailyRate}
              keyboardType="numeric"
              error={fieldErrors.daily_rate}
            />
            {/* IMPROVEMENT-PLAN PHASE 4 (§3) — prefill suggestion, not a
                hard picker: shown only while the field is still empty, so
                it never silently overwrites something already typed. */}
            {suggestedDailyRate !== null && !dailyRate && (
              <XStack
                alignItems="center"
                gap={4}
                onPress={() => setDailyRate(String(suggestedDailyRate))}
                accessibilityRole="button"
              >
                <Text fontSize={12.5} color="$neutral500">
                  Taux moyen pour {trade} : {suggestedDailyRate} TND/jour ·
                </Text>
                <Text fontSize={12.5} fontWeight="600" color="$accent600">
                  Utiliser
                </Text>
              </XStack>
            )}
          </YStack>

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

          {formError && <Text color="$danger">{formError}</Text>}

          <Button onPress={handleInvite} loading={saving}>
            Envoyer l&apos;invitation
          </Button>
        </YStack>
      </Sheet>
    );
  }
}

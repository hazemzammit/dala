import type { Material, Worker } from '@dala/shared-types';
import { reassignMaterialSchema, refuseMaterialSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { CheckIcon, PackageIcon, UserSwitchIcon, XIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/materials.tsx
 *
 * Doc 03 §3.15 — list with a pending-count badge, En attente/Approuvé/
 * Refusé filter; request detail with item/quantity/urgency/requesting
 * worker/note; Approuver / Refuser (reason, min 3 chars) / Réassigner
 * (worker picker).
 *
 * Approve/refuse/reassign are all plain updates under the existing
 * `materials_write_owner_manager` RLS policy, not security-definer RPCs —
 * unlike advances, nothing here moves money or resolves an ambiguous
 * caller identity server-side. Doc 01 §1.11.3 does list "material-request
 * approval that triggers a budget write" as idempotency-mandatory, but
 * the `materials` table (Doc 01 §1.2 confirms it's "unchanged … prior
 * shape") has no cost/amount field and nothing here writes to
 * `project_expenses` — approving a material request doesn't currently
 * move any money. If a future pass adds a cost field and wires approval
 * to the expense ledger, THAT'S the point this action needs to move
 * behind an idempotent RPC (mirroring create_advance/approve_advance) —
 * not before, since there'd be nothing to protect against a duplicate
 * write yet.
 *
 * No per-project filter on this screen, unlike Journal/Safety/Expenses —
 * Doc 03 §3.15 describes a flat "list … filter (En attente/Approuvé/
 * Refusé)" with no project grouping, so this stays a single org-wide
 * queue.
 */
type Filter = 'pending' | 'approved' | 'rejected';

const FILTER_OPTIONS: { value: Filter; label: string; color: string }[] = [
  { value: 'pending', label: 'En attente', color: '$neutral900' },
  { value: 'approved', label: 'Approuvé', color: '$success' },
  { value: 'rejected', label: 'Refusé', color: '$danger' },
];

const STATUS_VARIANT: Record<Material['status'], 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
};
const STATUS_LABEL: Record<Material['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};

export default function MaterialsScreen() {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [refuseSheetOpen, setRefuseSheetOpen] = useState(false);
  const [reassignSheetOpen, setReassignSheetOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
      return;
    }

    const [{ data: materialRows }, { data: workerRows }] = await Promise.all([
      supabase
        .from('materials')
        .select('*')
        .eq('org_id', org)
        .order('created_at', { ascending: false }),
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
    ]);
    setMaterials((materialRows as Material[] | null) ?? []);
    setWorkers((workerRows as Worker[] | null) ?? []);
    setLoading(false);
  }

  const workerByUserId = useMemo(() => {
    const map: Record<string, Worker> = {};
    workers.forEach((w) => {
      if (w.user_id) map[w.user_id] = w;
    });
    return map;
  }, [workers]);

  const workerById = useMemo(() => {
    const map: Record<string, Worker> = {};
    workers.forEach((w) => {
      map[w.id] = w;
    });
    return map;
  }, [workers]);

  const pendingCount = useMemo(
    () => materials.filter((m) => m.status === 'pending').length,
    [materials],
  );
  const filtered = useMemo(() => materials.filter((m) => m.status === filter), [materials, filter]);
  const detail = useMemo(
    () => materials.find((m) => m.id === detailId) ?? null,
    [materials, detailId],
  );

  function requestingWorkerName(m: Material): string {
    if (!m.created_by) return 'Contractant';
    return workerByUserId[m.created_by]?.full_name ?? 'Travailleur inconnu';
  }

  function openDetail(id: string) {
    setDetailId(id);
    setError(null);
  }

  async function handleApprove(materialId: string) {
    if (actionLoadingId) return;
    setActionLoadingId(materialId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error: updateError } = await supabase
        .from('materials')
        .update({ status: 'approved', approved_by: session?.user.id ?? null })
        .eq('id', materialId);
      if (updateError) throw updateError;
      haptics.confirm();
      setDetailId(null);
      await load();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Erreur', e?.message ?? "Impossible d'approuver cette demande.");
    } finally {
      setActionLoadingId(null);
    }
  }

  function openRefuseSheet() {
    setRejectionReason('');
    setError(null);
    setRefuseSheetOpen(true);
  }

  async function handleRefuse() {
    if (!detail) return;
    setError(null);
    const parsed = refuseMaterialSchema.safeParse({
      material_id: detail.id,
      rejection_reason: rejectionReason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Indiquez une raison (3 caractères minimum).');
      haptics.error();
      return;
    }

    setActionLoadingId(detail.id);
    try {
      const { error: updateError } = await supabase
        .from('materials')
        .update({ status: 'rejected', rejection_reason: parsed.data.rejection_reason })
        .eq('id', parsed.data.material_id);
      if (updateError) throw updateError;
      haptics.confirm();
      setRefuseSheetOpen(false);
      setDetailId(null);
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Impossible de refuser cette demande.');
    } finally {
      setActionLoadingId(null);
    }
  }

  function openReassignSheet() {
    setError(null);
    setReassignSheetOpen(true);
  }

  async function handleReassign(workerId: string) {
    if (!detail) return;
    const parsed = reassignMaterialSchema.safeParse({
      material_id: detail.id,
      worker_id: workerId,
    });
    if (!parsed.success) return;

    setActionLoadingId(detail.id);
    try {
      const { error: updateError } = await supabase
        .from('materials')
        .update({ assigned_worker_id: parsed.data.worker_id })
        .eq('id', parsed.data.material_id);
      if (updateError) throw updateError;
      haptics.confirm();
      setReassignSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      Alert.alert('Erreur', e?.message ?? 'Impossible de réassigner cette demande.');
    } finally {
      setActionLoadingId(null);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (materials.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={PackageIcon}
          illustration="to-do-app"
          title="Aucune demande de matériaux"
          description="Les demandes de matériaux de vos chantiers apparaîtront ici."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$1">
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Matériaux
          </Text>
          {pendingCount > 0 && (
            <StatusBadge variant="neutral">{`${pendingCount} en attente`}</StatusBadge>
          )}
        </XStack>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          Demandes de matériaux de vos travailleurs
        </Text>

        <YStack marginBottom="$4">
          <SegmentedControl value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
        </YStack>

        {filtered.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune demande dans cette catégorie.
          </Text>
        ) : (
          <YStack gap="$2">
            {filtered.map((m) => (
              <XStack
                key={m.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                justifyContent="space-between"
                alignItems="center"
                onPress={() => openDetail(m.id)}
              >
                <YStack flex={1} gap="$1">
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize={15.5} fontWeight="600">
                      {m.item}
                    </Text>
                    {m.urgency === 'urgent' && <StatusBadge variant="danger">Urgent</StatusBadge>}
                  </XStack>
                  <Text fontSize={13} color="$neutral500">
                    {requestingWorkerName(m)}
                    {m.quantity != null ? ` · Qté ${m.quantity}` : ''}
                  </Text>
                </YStack>
                <StatusBadge variant={STATUS_VARIANT[m.status]}>
                  {STATUS_LABEL[m.status]}
                </StatusBadge>
              </XStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={detail?.item ?? 'Demande'}
      >
        {detail && (
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontSize={13} color="$neutral500">
                Travailleur
              </Text>
              <XStack alignItems="center" gap="$2">
                <Avatar name={requestingWorkerName(detail)} size={28} />
                <Text fontSize={15}>{requestingWorkerName(detail)}</Text>
              </XStack>
            </YStack>

            <XStack gap="$4">
              {detail.quantity != null && (
                <YStack>
                  <Text fontSize={13} color="$neutral500">
                    Quantité
                  </Text>
                  <NumericText fontSize={15} fontWeight="600">
                    {detail.quantity}
                  </NumericText>
                </YStack>
              )}
              <YStack>
                <Text fontSize={13} color="$neutral500">
                  Urgence
                </Text>
                <Text
                  fontSize={15}
                  fontWeight="600"
                  color={detail.urgency === 'urgent' ? '$danger' : '$neutral900'}
                >
                  {detail.urgency === 'urgent' ? 'Urgent' : 'Normal'}
                </Text>
              </YStack>
            </XStack>

            {detail.note && (
              <YStack gap="$1">
                <Text fontSize={13} color="$neutral500">
                  Note
                </Text>
                <Text fontSize={14.5}>{detail.note}</Text>
              </YStack>
            )}

            {detail.assigned_worker_id && (
              <YStack gap="$1">
                <Text fontSize={13} color="$neutral500">
                  Réassigné à
                </Text>
                <Text fontSize={14.5}>
                  {workerById[detail.assigned_worker_id]?.full_name ?? '—'}
                </Text>
              </YStack>
            )}

            {detail.status === 'rejected' && detail.rejection_reason && (
              <YStack gap="$1">
                <Text fontSize={13} color="$neutral500">
                  Raison du refus
                </Text>
                <Text fontSize={14.5} color="$danger">
                  {detail.rejection_reason}
                </Text>
              </YStack>
            )}

            {detail.status === 'pending' && (
              <YStack gap="$2" marginTop="$2">
                <XStack gap="$2">
                  <Button
                    variant="secondary"
                    icon={XIcon}
                    loading={actionLoadingId === detail.id}
                    onPress={openRefuseSheet}
                  >
                    Refuser
                  </Button>
                  <Button
                    icon={CheckIcon}
                    loading={actionLoadingId === detail.id}
                    onPress={() => handleApprove(detail.id)}
                  >
                    Approuver
                  </Button>
                </XStack>
                <Button variant="secondary" icon={UserSwitchIcon} onPress={openReassignSheet}>
                  Réassigner
                </Button>
              </YStack>
            )}
          </YStack>
        )}
      </Sheet>

      <Sheet
        visible={refuseSheetOpen}
        onClose={() => setRefuseSheetOpen(false)}
        title="Refuser la demande"
      >
        <YStack gap="$3">
          <FormField
            label="Raison du refus"
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Ex : article indisponible actuellement"
          />
          {error && <Text color="$danger">{error}</Text>}
          <Button onPress={handleRefuse} loading={Boolean(detail && actionLoadingId === detail.id)}>
            Confirmer le refus
          </Button>
        </YStack>
      </Sheet>

      <Sheet
        visible={reassignSheetOpen}
        onClose={() => setReassignSheetOpen(false)}
        title="Réassigner à"
      >
        <YStack gap="$1">
          {workers.map((w) => (
            <XStack
              key={w.id}
              alignItems="center"
              gap="$3"
              paddingVertical={10}
              paddingHorizontal={8}
              borderRadius="$control"
              onPress={() => handleReassign(w.id)}
            >
              <Avatar name={w.full_name} size={28} />
              <Text fontSize={15}>{w.full_name}</Text>
            </XStack>
          ))}
        </YStack>
      </Sheet>
    </YStack>
  );
}

import type { Material } from '@dala/shared-types';
import { requestMaterialSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, PackageIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/material-request.tsx
 *
 * Doc 03 §4.3 — new route, didn't exist before this pass. Article/
 * Quantité/Urgence/Note form + a status-history list below it.
 *
 * Doc 03 §4.3's field table has no project selector at all — the worker
 * app is "three actions, everything else read-only" (Doc 03 §4), and
 * adding a project picker here would be scope creep beyond what the spec
 * actually asks for. `project_id` is instead auto-resolved from the
 * worker's current dispatch assignment (today's mission, same source
 * (worker)/home.tsx already reads) — if there's no assignment today, the
 * request is still submitted, just without a project attached
 * (materials.project_id is nullable).
 *
 * No idempotency key here, unlike advance-request.tsx / update-chantier —
 * Doc 01 §1.9.1 explicitly lists "material requests" as an append-only
 * table where "two offline writes from two different devices simply
 * become two rows — there is no conflict to resolve, by construction,"
 * and §1.11.3's mandatory-idempotency list is money-moving actions only.
 * A plain RLS-checked insert (migration 0020's materials_insert_self) is
 * the correct amount of machinery here, not a security-definer RPC.
 */
const URGENCY_OPTIONS = [
  { value: 'normal' as const, label: 'Normal', color: '$neutral900' },
  { value: 'urgent' as const, label: 'Urgent', color: '$danger' },
];

const STATUS_LABEL: Record<Material['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};
const STATUS_VARIANT: Record<Material['status'], 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
};

export default function MaterialRequestScreen() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [history, setHistory] = useState<Material[]>([]);

  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: worker } = await supabase
        .from('workers')
        .select('id, org_id')
        .eq('user_id', session.user.id)
        .single();
      if (!worker) return;

      setOrgId(worker.org_id);

      const today = new Date().toISOString().slice(0, 10);
      const { data: assignment } = await supabase
        .from('dispatch_assignments')
        .select('project_id, projects(name)')
        .eq('worker_id', worker.id)
        .eq('assignment_date', today)
        .maybeSingle();

      setProjectId(assignment?.project_id ?? null);
      setProjectName((assignment as any)?.projects?.name ?? null);

      // materials_select_self (migration 0020) — read back only this
      // worker's own requests, ordered newest first.
      const { data: requests } = await supabase
        .from('materials')
        .select('*')
        .eq('created_by', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setHistory((requests as Material[] | null) ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session || !orgId) {
      setError('Session expirée. Reconnectez-vous.');
      haptics.error();
      return;
    }

    const parsed = requestMaterialSchema.safeParse({
      project_id: projectId ?? undefined,
      item,
      quantity: quantity ? Number(quantity) : undefined,
      urgency,
      note: note || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.');
      haptics.error();
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('materials').insert({
        org_id: orgId,
        project_id: parsed.data.project_id ?? null,
        item: parsed.data.item,
        quantity: parsed.data.quantity,
        urgency: parsed.data.urgency,
        note: parsed.data.note ?? null,
        status: 'pending',
        created_by: session.user.id,
      });
      if (insertError) throw insertError;

      haptics.confirm();
      setItem('');
      setQuantity('');
      setUrgency('normal');
      setNote('');
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={3} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <XStack alignItems="center" gap="$2" marginBottom="$4" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} />
          <Text fontSize={15} color="$neutral500">
            Retour
          </Text>
        </XStack>

        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
          Demander du matériel
        </Text>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          {projectName ? `Pour ${projectName}` : "Aucun chantier assigné aujourd'hui"}
        </Text>

        <YStack gap="$3" marginBottom="$5">
          <FormField
            label="Article"
            value={item}
            onChangeText={setItem}
            placeholder="Ex : ciment, gants..."
          />
          <FormField
            label="Quantité"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Urgence
            </Text>
            <SegmentedControl value={urgency} options={URGENCY_OPTIONS} onChange={setUrgency} />
          </YStack>
          <FormField label="Note (optionnel)" value={note} onChangeText={setNote} maxLength={200} />
          {error && <Text color="$danger">{error}</Text>}
          <Button icon={PackageIcon} onPress={handleSubmit} loading={submitting}>
            Envoyer la demande
          </Button>
        </YStack>

        <Text
          fontSize={13}
          fontWeight="600"
          color="$neutral500"
          textTransform="uppercase"
          marginBottom="$2"
        >
          Historique
        </Text>
        {history.length === 0 ? (
          <Text color="$neutral500" fontSize={14}>
            Aucune demande envoyée pour le moment.
          </Text>
        ) : (
          <YStack backgroundColor="$neutral0" borderRadius="$card" overflow="hidden">
            {history.map((request, i) => (
              <XStack
                key={request.id}
                justifyContent="space-between"
                alignItems="center"
                paddingHorizontal="$4"
                paddingVertical={12}
                borderTopWidth={i === 0 ? 0 : 1}
                borderTopColor="$neutral100"
              >
                <YStack flex={1}>
                  <Text fontSize={14.5} fontWeight="500">
                    {request.item}
                  </Text>
                  {request.quantity != null && (
                    <Text fontSize={12} color="$neutral500">
                      Quantité : {request.quantity}
                    </Text>
                  )}
                </YStack>
                <StatusBadge variant={STATUS_VARIANT[request.status]}>
                  {STATUS_LABEL[request.status]}
                </StatusBadge>
              </XStack>
            ))}
          </YStack>
        )}
      </ScrollView>
    </YStack>
  );
}

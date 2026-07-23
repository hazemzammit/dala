import { requestAdvanceSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, HandCoinsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonHero } from '@/components/ui/Skeleton';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cycleStartISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/advance-request.tsx
 *
 * Doc 03 §4.4 — new route, didn't exist before this pass. Live balance
 * (gross so far / advances received / estimated net) above a two-field
 * form. Calls request_advance() (migration 0019) rather than inserting
 * into `advances` directly — that RPC is the only path that resolves the
 * calling worker server-side and records the Doc 01 §1.11 idempotency
 * entry.
 *
 * Doc 03 §4.4 also describes a push notification on contractor approval
 * updating the balance live. That needs a server-side trigger dispatching
 * through expo-notifications' push service when `advances.status` flips —
 * infrastructure that doesn't exist yet for any screen in this app, not
 * something to bolt on as a one-off for this screen. Deferred; noted in
 * the delivery guide.
 */
export default function AdvanceRequestScreen() {
  const [loading, setLoading] = useState(true);
  const [gross, setGross] = useState(0);
  const [advancesReceived, setAdvancesReceived] = useState(0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
        .select('id, daily_rate')
        .eq('user_id', session.user.id)
        .single();
      if (!worker) return;

      const cycleStart = cycleStartISO();
      const [{ data: attendance }, { data: advances }] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('status')
          .eq('worker_id', worker.id)
          .gte('record_date', cycleStart),
        supabase
          .from('advances')
          .select('amount')
          .eq('worker_id', worker.id)
          .eq('status', 'approved')
          .gte('created_at', cycleStart),
      ]);

      const dayValue = (status: string) =>
        status === 'half_day' ? 0.5 : status === 'present' ? 1 : 0;
      const days = (attendance ?? []).reduce((sum, r) => sum + dayValue(r.status), 0);
      setGross(days * (worker.daily_rate ?? 0));
      setAdvancesReceived((advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0));
    } finally {
      setLoading(false);
    }
  }

  const estimatedNet = gross - advancesReceived;

  async function handleSubmit() {
    setError(null);
    // Fresh idempotency key generated at tap-time, not on screen mount —
    // a worker could sit on this form for a while before submitting.
    const idempotencyKey = newIdempotencyKey();

    const parsed = requestAdvanceSchema.safeParse({
      amount: amount ? Number(amount) : undefined,
      reason: reason || undefined,
      idempotency_key: idempotencyKey,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Merci d’indiquer un montant valide.');
      haptics.error();
      return;
    }

    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('request_advance', {
        p_amount: parsed.data.amount,
        p_reason: parsed.data.reason ?? null,
        p_idempotency_key: parsed.data.idempotency_key,
      });
      if (rpcError) throw rpcError;
      // Judgment call (flagged per the brief): treating a successfully
      // *submitted* request as its own confirm-worthy moment, distinct
      // from the money actually moving on approval — the tap itself
      // (form validated, write succeeded, nothing left for the worker to
      // do but wait) is the "meaningful moment" from the worker's side.
      haptics.confirm();
      setSubmitted(true);
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
        <SkeletonHero />
      </YStack>
    );
  }

  if (submitted) {
    return (
      <YStack
        flex={1}
        backgroundColor="$neutral25"
        alignItems="center"
        justifyContent="center"
        padding="$4"
      >
        <Text
          fontFamily="$display"
          fontSize={20}
          fontWeight="600"
          textAlign="center"
          marginBottom="$2"
        >
          Demande envoyée
        </Text>
        <Text color="$neutral500" fontSize={14} textAlign="center" marginBottom="$4">
          Votre responsable a été notifié. Vous recevrez une confirmation dès l'approbation.
        </Text>
        <Button fullWidth={false} onPress={() => router.back()}>
          Retour
        </Button>
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

        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Demander une avance
        </Text>

        <YStack backgroundColor="$neutral900" borderRadius="$card" padding="$4" marginBottom="$4">
          <XStack justifyContent="space-between">
            <YStack>
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Brut (semaine)
              </Text>
              <NumericText color="$neutral0" fontSize={17} fontWeight="600">
                {gross.toFixed(0)} TND
              </NumericText>
            </YStack>
            <YStack>
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Avances reçues
              </Text>
              <NumericText color="$neutral0" fontSize={17} fontWeight="600">
                {advancesReceived.toFixed(0)} TND
              </NumericText>
            </YStack>
            <YStack alignItems="flex-end">
              <Text color="$neutral0" opacity={0.7} fontSize={12}>
                Net estimé
              </Text>
              <NumericText color="$neutral0" fontFamily="$display" fontSize={21} fontWeight="700">
                {estimatedNet.toFixed(0)} TND
              </NumericText>
            </YStack>
          </XStack>
        </YStack>

        <YStack gap="$3">
          <FormField
            label="Montant (TND)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
          <FormField
            label="Raison (optionnel)"
            value={reason}
            onChangeText={setReason}
            maxLength={200}
          />
          {error && <Text color="$danger">{error}</Text>}
          <Button icon={HandCoinsIcon} onPress={handleSubmit} loading={submitting}>
            Demander une avance
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
}

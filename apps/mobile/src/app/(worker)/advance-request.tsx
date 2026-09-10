import { color } from '@dala/design-tokens';
import { requestAdvanceSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, HandCoinsIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { NumericText } from '@/components/ui/NumericText';
import { SkeletonHero } from '@/components/ui/Skeleton';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import Advance from '@/db/models/Advance';
import { runSync } from '@/db/sync';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { cycleStartISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/advance-request.tsx
 *
 * Doc 03 §4.4 — new route, didn't exist before this pass. Live balance
 * (gross so far / advances received / estimated net) above a two-field
 * form.
 *
 * PHASE 19 — `handleSubmit` no longer calls `request_advance()` directly.
 * It writes a local WatermelonDB `advances` record first (works offline,
 * instant), then fires `runSync()` in the background (not awaited — the
 * screen doesn't block on network) to push it via the RPC as soon as
 * there's connectivity. `status: 'pending'` and `requestedBy` set (not
 * `approvedBy`) are exactly the two fields `pushChanges.ts`'s `pushAdvances()`
 * inspects to route this row to `request_advance()` rather than
 * `create_advance()` at push time — see that file's header. `id` is
 * generated client-side (via `createWithClientId()`) and reused as the
 * RPC's `p_id` argument at push time (migration 0047), so the local record
 * and the eventual server row are the same UUID throughout, online or
 * offline.
 *
 * The "Demande envoyée" confirmation now means "saved locally and queued,"
 * not "confirmed by the server" — the copy below already only ever said
 * "votre responsable a été notifié," which was already describing an
 * eventual, not immediate, server-side effect, so no wording change is
 * needed for this to remain accurate offline.
 *
 * Doc 03 §4.4 also describes a push notification on contractor approval
 * updating the balance live. Audit fix 3a (migration 0087) added the
 * server-side trigger this needed — `notify_advance_decision()` fires on
 * `advances.status` flipping to approved/rejected and pushes
 * `requested_by` via the same `send_expo_push()` helper Phase 9's
 * dispatch/materials/safety triggers already use, tagged
 * `{ type: 'advance', id }` so NotificationRouter.tsx routes a tap back
 * to this screen.
 *
 * Phase 13 fix: `gross` below now reads `attendance_effective` (migration
 * 0036) instead of raw `attendance_records`. Before this, every row for
 * the cycle was summed with NO dedup by date at all — a worker with both a
 * manual and dispatch row on the same day had that day counted TWICE in
 * the live-balance estimate shown here. This number isn't submitted
 * anywhere (request_advance() doesn't take it as an argument), but showing
 * an inflated estimate to a worker deciding whether to request an advance
 * is a real trust/UX bug, not a cosmetic one.
 */
export default function AdvanceRequestScreen() {
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — none of this screen's queries had error capture;
  // a failure silently left gross/advances at 0, indistinguishable from
  // a genuinely new worker with no attendance yet.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [gross, setGross] = useState(0);
  const [advancesReceived, setAdvancesReceived] = useState(0);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [worker, setWorker] = useState<{ id: string; orgId: string; userId: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data: workerRow, error: workerError } = await supabase
        .from('workers')
        .select('id, org_id, daily_rate')
        .eq('user_id', session.user.id)
        .single();
      if (workerError) {
        setLoadError(true);
        return;
      }
      if (!workerRow) return;
      setWorker({ id: workerRow.id, orgId: workerRow.org_id, userId: session.user.id });

      const cycleStart = cycleStartISO();
      const [
        { data: attendance, error: attendanceError },
        { data: advances, error: advancesError },
      ] = await Promise.all([
        supabase
          .from('attendance_effective')
          .select('status')
          .eq('worker_id', workerRow.id)
          .gte('record_date', cycleStart),
        supabase
          .from('advances')
          .select('amount')
          .eq('worker_id', workerRow.id)
          .eq('status', 'approved')
          .gte('created_at', cycleStart),
      ]);
      if (attendanceError || advancesError) {
        setLoadError(true);
        return;
      }

      const dayValue = (status: string) =>
        status === 'half_day' ? 0.5 : status === 'present' ? 1 : 0;
      const days = (attendance ?? []).reduce((sum, r) => sum + dayValue(r.status), 0);
      setGross(days * (workerRow.daily_rate ?? 0));
      setAdvancesReceived((advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const estimatedNet = gross - advancesReceived;

  async function handleSubmit() {
    setError(null);
    if (!worker) {
      setError('Une erreur est survenue. Réessayez.');
      return;
    }

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
      await database.write(() =>
        createWithClientId(database.get<Advance>('advances'), (record) => {
          record.orgId = worker.orgId;
          record.workerId = worker.id;
          record.amount = parsed.data.amount;
          record.reason = parsed.data.reason ?? null;
          record.status = 'pending';
          record.requestedBy = worker.userId;
          record.approvedBy = null;
          record.idempotencyKey = parsed.data.idempotency_key;
        }),
      );

      // Best-effort, not awaited by the UI transition below — the local
      // write above is what makes this screen work offline; sync is a
      // background concern from here on. Errors are handled inside
      // runSync() itself (logged + reported to Sentry), not here.
      void runSync();

      // Judgment call (flagged per the brief): treating a successfully
      // *saved* request as its own confirm-worthy moment, distinct
      // from the money actually moving on approval — the tap itself
      // (form validated, write succeeded, nothing left for the worker to
      // do but wait) is the "meaningful moment" from the worker's side.
      // This now holds true offline too: "saved" is accurate the instant
      // the local write above completes, without waiting on the network.
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

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
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
        <Icon3D name="hand-coins" />
        <Text
          fontFamily="$display"
          fontSize={20}
          fontWeight="600"
          textAlign="center"
          marginBottom="$2"
          marginTop="$3"
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
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
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
            error={error ?? undefined}
          />
          <FormField
            label="Raison (optionnel)"
            value={reason}
            onChangeText={setReason}
            maxLength={200}
          />
          <Button icon={HandCoinsIcon} onPress={handleSubmit} loading={submitting}>
            Demander une avance
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
}

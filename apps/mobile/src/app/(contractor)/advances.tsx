import { color } from '@dala/design-tokens';
import type { Advance, AttendanceStatus, SalaryCycle, Worker } from '@dala/shared-types';
import { createAdvanceSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { CheckIcon, HandCoinsIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { CriticalMetricHero } from '@/components/ui/CriticalMetricHero';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { ListCard } from '@/components/ui/ListCard';
import { NumericText } from '@/components/ui/NumericText';
import { ProgressRing } from '@/components/ui/Progress';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { useFabBottomContentInset } from '@/lib/fabLayout';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { collapseOut, listReflow } from '@/lib/motion';
import { cycleEndISO, cycleStartISO } from '@/lib/salaryCycle';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/advances.tsx
 *
 * Doc 03 §3.14 — weekly per-worker payroll card + quick-advance FAB flow +
 * a "Demandes en attente" section for worker-submitted requests
 * (request_advance() — Doc 03 §4.4). That approval step isn't spelled out
 * in §3.14 itself, but approveAdvanceSchema already existed in
 * packages/validation before this pass, and a pending request needs
 * somewhere to be actioned — see the delivery notes for this judgment
 * call.
 *
 * Idempotency (Doc 01 §1.11 / migration 0019's RPCs): both "Nouvelle
 * avance" and "Marquer comme payé" generate a fresh idempotency key the
 * instant the button is tapped and disable that row/sheet immediately —
 * never a shared/memoized key across taps.
 *
 * Phase 13 fix: the days-worked figure below now reads `attendance_effective`
 * (migration 0036) instead of raw `attendance_records`. Before this, a
 * worker with both a manual_pointage row and a dispatch_checkin row on the
 * same day had that day counted TWICE toward gross pay — a real
 * money-calculation bug, not a display nuance. See 0036's header for the
 * full audit of which screens this affected.
 *
 * UI/UX pass — two real bugs, not just polish:
 *   1. Each worker's Net figure was hardcoded to `$accent600` (teal)
 *      regardless of sign — since `net = gross - advancesGiven` can and
 *      does go negative (a worker advanced more than they've earned so
 *      far this cycle), a negative net was rendering in the same color as
 *      a positive one. Now signed: `$success` when >= 0, `$danger` when
 *      negative, matching the semantic color rule already established
 *      elsewhere (Progress.tsx's threshold colors).
 *   2. Approve/Refuse had no optimistic feedback beyond the button's own
 *      inline spinner — the card just sat there through the round-trip.
 *      Now wrapped in `Animated.View` with `collapseOut`/`listReflow`
 *      (lib/motion.ts) so a resolved request visibly leaves the pending
 *      list instead of silently re-rendering in place.
 * Also added: pull-to-refresh, and a small `ProgressRing` next to the hero
 * card showing paid/total workers this cycle — the screen's only progress
 * indicator before this was buried inside each worker card's own bar-less
 * Brut/Avances/Net row.
 */
const AMOUNT_CHIPS = [20, 50, 100];

const STATUS_VALUE: Record<AttendanceStatus, number> = { present: 1, absent: 0, half_day: 0.5 };

interface WorkerPayroll {
  worker: Worker;
  daysThisCycle: number;
  gross: number;
  advancesGiven: number;
  net: number;
  cycle: SalaryCycle | null;
}

export default function AdvancesScreen() {
  // Doc 05 §1.7l (Phase 19A) — fixes the confirmed live FAB-overlap defect:
  // was a hardcoded `paddingBottom: 140`, less than the FAB's own
  // footprint even before adding the device's safe-area inset. See
  // fabLayout.ts for the formula.
  const fabBottomInset = useFabBottomContentInset();
  const toast = useToast();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Phase 20 (§1.7a) — the four parallel payroll queries below had no
  // error capture; a failed fetch previously rendered as "Aucun
  // travailleur," indistinguishable from a genuinely empty team.
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<WorkerPayroll[]>([]);
  const [pending, setPending] = useState<(Advance & { workerName: string })[]>([]);
  const [payingWorkerId, setPayingWorkerId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [chipAmount, setChipAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savingAdvance, setSavingAdvance] = useState(false);

  const cycleStart = cycleStartISO();
  const cycleEnd = cycleEndISO();

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [
      { data: workers, error: workersError },
      { data: attendance, error: attendanceError },
      { data: advances, error: advancesError },
      { data: cycles, error: cyclesError },
    ] = await Promise.all([
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
      supabase
        .from('attendance_effective')
        .select('worker_id, status')
        .eq('org_id', org)
        .gte('record_date', cycleStart)
        .lte('record_date', cycleEnd),
      supabase
        .from('advances')
        .select('*')
        .eq('org_id', org)
        .gte('created_at', cycleStart)
        .order('created_at', { ascending: false }),
      supabase.from('salary_cycles').select('*').eq('org_id', org).eq('cycle_start', cycleStart),
    ]);

    if (workersError || attendanceError || advancesError || cyclesError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const workerList = workers ?? [];
    const approvedByWorker: Record<string, number> = {};
    (advances ?? [])
      .filter((a) => a.status === 'approved')
      .forEach((a) => {
        approvedByWorker[a.worker_id] = (approvedByWorker[a.worker_id] ?? 0) + Number(a.amount);
      });

    const daysByWorker: Record<string, number> = {};
    (attendance ?? []).forEach((r) => {
      const v = STATUS_VALUE[r.status as AttendanceStatus] ?? 0;
      daysByWorker[r.worker_id] = (daysByWorker[r.worker_id] ?? 0) + v;
    });

    const cycleByWorker: Record<string, SalaryCycle> = {};
    (cycles ?? []).forEach((c) => {
      cycleByWorker[c.worker_id] = c as SalaryCycle;
    });

    const computed: WorkerPayroll[] = workerList.map((w) => {
      const daysThisCycle = daysByWorker[w.id] ?? 0;
      const gross = daysThisCycle * (w.daily_rate ?? 0);
      const advancesGiven = approvedByWorker[w.id] ?? 0;
      return {
        worker: w,
        daysThisCycle,
        gross,
        advancesGiven,
        net: gross - advancesGiven,
        cycle: cycleByWorker[w.id] ?? null,
      };
    });
    setRows(computed);

    const workerNameById: Record<string, string> = {};
    workerList.forEach((w) => {
      workerNameById[w.id] = w.full_name;
    });
    const pendingRequests = (advances ?? [])
      .filter((a) => a.status === 'pending')
      .map((a) => ({ ...(a as Advance), workerName: workerNameById[a.worker_id] ?? '—' }));
    setPending(pendingRequests);

    setLoading(false);
    setRefreshing(false);
  }

  const runningTotal = useMemo(
    () => rows.filter((r) => r.cycle?.status !== 'paid').reduce((sum, r) => sum + r.net, 0),
    [rows],
  );

  // Paid/total ratio for the new hero-adjacent ring — was previously
  // buried per-row as a StatusBadge with no aggregate view.
  const paidCount = useMemo(() => rows.filter((r) => r.cycle?.status === 'paid').length, [rows]);
  const paidPercent = rows.length > 0 ? Math.round((paidCount / rows.length) * 100) : 0;

  function openAdvanceSheet(workerId?: string) {
    setSelectedWorkerId(workerId ?? null);
    setChipAmount(null);
    setCustomAmount('');
    setUseCustom(false);
    setReason('');
    setFormError(null);
    setSheetOpen(true);
  }

  async function handleCreateAdvance() {
    setFormError(null);
    if (!orgId) return;
    if (!selectedWorkerId) {
      setFormError('Sélectionnez un travailleur.');
      haptics.error();
      return;
    }

    const amount = useCustom ? Number(customAmount) : chipAmount;
    // Idempotency key generated the instant the confirm tap happens, per
    // Doc 01 §1.11.2 — never earlier (e.g. on sheet open), so a sheet left
    // open a long time doesn't reuse a stale key.
    const idempotencyKey = newIdempotencyKey();

    const parsed = createAdvanceSchema.safeParse({
      worker_id: selectedWorkerId,
      amount,
      reason: reason || undefined,
      idempotency_key: idempotencyKey,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Merci d’indiquer un montant valide.');
      haptics.error();
      return;
    }

    setSavingAdvance(true);
    try {
      const { error } = await supabase.rpc('create_advance', {
        p_org_id: orgId,
        p_worker_id: parsed.data.worker_id,
        p_amount: parsed.data.amount,
        p_reason: parsed.data.reason ?? null,
        p_idempotency_key: parsed.data.idempotency_key,
      });
      if (error) throw error;
      haptics.confirm();
      toast.success('Avance enregistrée.');
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setFormError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSavingAdvance(false);
    }
  }

  async function handleMarkPaidConfirmed(
    workerId: string,
    existingCycle: SalaryCycle | null,
    reason: string,
  ) {
    if (!orgId || payingWorkerId) return;
    setPayingWorkerId(workerId);
    const idempotencyKey = newIdempotencyKey();
    try {
      let cycleId = existingCycle?.id;
      if (!cycleId) {
        // The salary_cycles row itself isn't a money-moving write (it's
        // just the container "mark paid" flips a status on) — a plain
        // upsert under the existing owner/manager RLS policy is enough,
        // no RPC/idempotency needed for this step.
        const { data, error } = await supabase
          .from('salary_cycles')
          .upsert(
            { org_id: orgId, worker_id: workerId, cycle_start: cycleStart, cycle_end: cycleEnd },
            { onConflict: 'org_id,worker_id,cycle_start' },
          )
          .select()
          .single();
        if (error) throw error;
        cycleId = data.id;
      }

      // migration 0090 — p_reason is mandatory server-side (raises
      // reason_required below 10 chars); the dialog's own `reasonOk` gate
      // already prevents a call getting here with a too-short reason, this
      // is defense in depth, not the only check.
      const { error: rpcError } = await supabase.rpc('mark_salary_cycle_paid', {
        p_salary_cycle_id: cycleId,
        p_idempotency_key: idempotencyKey,
        p_reason: reason,
      });
      if (rpcError) throw rpcError;
      haptics.confirm();
      toast.success('Cycle marqué comme payé.');
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de marquer ce cycle comme payé.');
    } finally {
      setPayingWorkerId(null);
      setPendingTier3Action(null);
    }
  }

  async function handleApproveConfirmed(advanceId: string, reason: string) {
    if (respondingId) return;
    setRespondingId(advanceId);
    const idempotencyKey = newIdempotencyKey();
    try {
      const { error } = await supabase.rpc('approve_advance', {
        p_advance_id: advanceId,
        p_idempotency_key: idempotencyKey,
        p_reason: reason,
      });
      if (error) throw error;
      haptics.confirm();
      toast.success('Demande approuvée.');
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? "Impossible d'approuver cette demande.");
    } finally {
      setRespondingId(null);
      setPendingTier3Action(null);
    }
  }

  async function handleRejectConfirmed(advanceId: string, reason: string) {
    if (respondingId) return;
    setRespondingId(advanceId);
    try {
      // Rejection isn't in Doc 01 §1.11.3's mandatory-idempotency list
      // (only creation/approval/mark-paid are) — a plain update under the
      // existing advances_write_owner_manager policy is sufficient here,
      // same pattern as materials.tsx's own reject flow (migration 0090
      // adds manager_reason, RLS already covers writing it).
      const { error } = await supabase
        .from('advances')
        .update({ status: 'rejected', manager_reason: reason })
        .eq('id', advanceId);
      if (error) throw error;
      toast.success('Demande refusée.');
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de refuser cette demande.');
    } finally {
      setRespondingId(null);
      setPendingTier3Action(null);
    }
  }

  // Doc 05 §1.7c (Tier 3, Phase 19C) — Approve/Reject/Mark-as-Paid all
  // gate through this typed-confirmation step now instead of firing
  // directly from the row button. See ConfirmTypingDialog.tsx's header
  // for why this is mobile's Tier 3 pattern (typed worker name + a
  // mandatory reason, the latter wired to a real column/RPC param in
  // migration 0090 — Phase 19F closed the backend gap named here since
  // 19C).
  type Tier3Action =
    | { kind: 'approve'; advanceId: string; workerName: string }
    | { kind: 'reject'; advanceId: string; workerName: string }
    | { kind: 'markPaid'; workerId: string; workerName: string; existingCycle: SalaryCycle | null };

  const [pendingTier3Action, setPendingTier3Action] = useState<Tier3Action | null>(null);

  function handleApprove(advanceId: string, workerName: string) {
    setPendingTier3Action({ kind: 'approve', advanceId, workerName });
  }

  function handleReject(advanceId: string, workerName: string) {
    setPendingTier3Action({ kind: 'reject', advanceId, workerName });
  }

  function handleMarkPaid(workerId: string, workerName: string, existingCycle: SalaryCycle | null) {
    setPendingTier3Action({ kind: 'markPaid', workerId, workerName, existingCycle });
  }

  function handleConfirmTier3Action(reason: string) {
    if (!pendingTier3Action) return;
    if (pendingTier3Action.kind === 'approve') {
      void handleApproveConfirmed(pendingTier3Action.advanceId, reason);
    } else if (pendingTier3Action.kind === 'reject') {
      void handleRejectConfirmed(pendingTier3Action.advanceId, reason);
    } else {
      void handleMarkPaidConfirmed(
        pendingTier3Action.workerId,
        pendingTier3Action.existingCycle,
        reason,
      );
    }
  }

  const tier3Busy =
    pendingTier3Action?.kind === 'markPaid'
      ? payingWorkerId === pendingTier3Action.workerId
      : respondingId === pendingTier3Action?.advanceId;

  const selectedWorkerNet = rows.find((r) => r.worker.id === selectedWorkerId)?.net ?? null;
  const previewAmount = useCustom ? Number(customAmount) || 0 : (chipAmount ?? 0);
  const exceedsNetWarning =
    selectedWorkerNet !== null && previewAmount > 0 && previewAmount > selectedWorkerNet;

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonCardList cards={4} />
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

  if (rows.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={HandCoinsIcon}
          illustration="send-money"
          title="Aucun travailleur"
          description="Invitez d'abord des travailleurs depuis l'écran Équipe pour suivre avances et paie."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
          Avances & paie
        </Text>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          Cycle du {cycleStart} au {cycleEnd}
        </Text>

        {/* Phase 20 — extracted to the shared CriticalMetricHero (Doc 05
            §1.7g); markup/values unchanged, this is the mechanism this
            screen originated. */}
        <CriticalMetricHero
          label="Net restant à payer cette semaine"
          value={runningTotal.toFixed(0)}
          unit="TND"
          supporting={
            // Paid/total ring — the screen's first aggregate progress
            // indicator; each worker card below only ever showed its own
            // row-level "Payé"/"En attente" badge, with no crew-wide view.
            // Explicit tintColor: ProgressRing's default threshold color
            // assumes high-value-is-bad (budget consumed), the opposite
            // semantic of a paid ratio, where high is good.
            <ProgressRing
              value={paidPercent}
              size={54}
              strokeWidth={5}
              trackColor="#2A2C32"
              tintColor={color.accent[600]}
            >
              <Text color="$neutral0" fontSize={12} fontWeight="700">
                {paidCount}/{rows.length}
              </Text>
            </ProgressRing>
          }
        />

        {pending.length > 0 && (
          <YStack gap="$2" marginBottom="$4">
            <Text fontSize={13} fontWeight="600" color="$neutral500" textTransform="uppercase">
              Demandes en attente
            </Text>
            {/* UI/UX pass — composes the shared `ListCard`, same as the
                worker rows below, for visual consistency within this one
                screen (previously a separately hand-rolled YStack). The
                Refuser/Approuver pair moves onto `shareRow` (see
                Button.tsx) so both buttons evenly fill the row's width
                instead of hugging their own content — a small polish,
                not a bug fix: `fullWidth={false}` here was already
                correct (this pair was never the reported overflow bug),
                just visually inconsistent with the primary card's button
                row below it. */}
            {pending.map((request) => (
              <Animated.View key={request.id} exiting={collapseOut} layout={listReflow}>
                <ListCard
                  leading={<Avatar name={request.workerName} size={32} />}
                  title={request.workerName}
                  subtitle={request.reason || undefined}
                  badge={
                    <NumericText fontSize={16} fontWeight="600">
                      {Number(request.amount).toFixed(0)} TND
                    </NumericText>
                  }
                >
                  <XStack gap="$2">
                    <Button
                      variant="secondary"
                      shareRow
                      icon={XIcon}
                      loading={respondingId === request.id}
                      onPress={() => handleReject(request.id, request.workerName)}
                    >
                      Refuser
                    </Button>
                    <Button
                      shareRow
                      icon={CheckIcon}
                      loading={respondingId === request.id}
                      onPress={() => handleApprove(request.id, request.workerName)}
                    >
                      Approuver
                    </Button>
                  </XStack>
                </ListCard>
              </Animated.View>
            ))}
          </YStack>
        )}

        <YStack gap="$2">
          {rows.map(({ worker, daysThisCycle, gross, advancesGiven, net, cycle }) => {
            const paid = cycle?.status === 'paid';
            return (
              // Component-architecture pass — now composes the shared
              // `ListCard` primitive (components/ui/ListCard.tsx) instead
              // of a hand-rolled YStack, same as the redesigned Chantiers
              // cards. `leading` takes the worker's Avatar (a person, not
              // a category, is the subject here — the icon-chip slot is
              // for Chantiers' project-type case). Status is still
              // legible from the card's overall shape via `muted`, not
              // only the badge — never color alone.
              <ListCard
                key={worker.id}
                leading={<Avatar name={worker.full_name} />}
                title={worker.full_name}
                subtitle={`${worker.trade ? `${worker.trade} · ` : ''}${daysThisCycle}j cette semaine`}
                muted={paid}
                badge={
                  <StatusBadge variant={paid ? 'success' : 'neutral'}>
                    {paid ? 'Payé' : 'En attente'}
                  </StatusBadge>
                }
              >
                <XStack justifyContent="space-between">
                  <YStack>
                    <Text fontSize={12} color="$neutral500">
                      Brut
                    </Text>
                    <NumericText fontSize={15.5} fontWeight="600">
                      {gross.toFixed(0)} TND
                    </NumericText>
                  </YStack>
                  <YStack>
                    <Text fontSize={12} color="$neutral500">
                      Avances
                    </Text>
                    <NumericText fontSize={15.5} fontWeight="600">
                      {advancesGiven.toFixed(0)} TND
                    </NumericText>
                  </YStack>
                  <YStack alignItems="flex-end">
                    <Text fontSize={12} color="$neutral500">
                      Net
                    </Text>
                    {/* Bug fix — this was hardcoded to $accent600 (teal)
                        regardless of sign; net can go negative when a
                        worker's advances this cycle exceed what they've
                        earned so far. Now semantically signed. */}
                    <NumericText
                      fontSize={15.5}
                      fontWeight="700"
                      color={net >= 0 ? '$success' : '$danger'}
                    >
                      {net.toFixed(0)} TND
                    </NumericText>
                  </YStack>
                </XStack>

                {/* Bug fix (UI/UX audit) — both actions were previously
                    `fullWidth` (Button.tsx: width: '100%') in the same
                    non-wrapping row, so each demanded the entire row's
                    width and the second button overflowed the card/screen.
                    `shareRow` (new Button variant, see Button.tsx's own
                    comment) makes them share the row instead — "Marquer
                    comme payé" also gets `variant="secondary"` once
                    already paid, and its label shortens to a checkmark +
                    "Payé", so a paid card reads as visually settled
                    rather than presenting two equal-weight buttons. */}
                <XStack gap="$2">
                  <Button variant="secondary" shareRow onPress={() => openAdvanceSheet(worker.id)}>
                    Nouvelle avance
                  </Button>
                  <Button
                    shareRow
                    variant={paid ? 'secondary' : 'primary'}
                    icon={paid ? CheckIcon : undefined}
                    disabled={paid}
                    loading={payingWorkerId === worker.id}
                    onPress={() => handleMarkPaid(worker.id, worker.full_name, cycle)}
                  >
                    {paid ? 'Payé' : 'Marquer comme payé'}
                  </Button>
                </XStack>
              </ListCard>
            );
          })}
        </YStack>
      </ScrollView>

      <FAB
        icon={PlusIcon}
        accessibilityLabel="Nouvelle avance"
        onPress={() => openAdvanceSheet()}
      />

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Nouvelle avance">
        <YStack gap="$3">
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Travailleur
            </Text>
            <YStack gap="$1">
              {rows.map(({ worker }) => (
                <XStack
                  key={worker.id}
                  alignItems="center"
                  gap="$3"
                  paddingVertical={8}
                  paddingHorizontal={8}
                  borderRadius="$control"
                  backgroundColor={selectedWorkerId === worker.id ? '$accent50' : 'transparent'}
                  onPress={() => setSelectedWorkerId(worker.id)}
                >
                  <Avatar name={worker.full_name} size={28} />
                  <Text fontSize={15} fontWeight={selectedWorkerId === worker.id ? '600' : '400'}>
                    {worker.full_name}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Montant (TND)
            </Text>
            <XStack gap="$2">
              {AMOUNT_CHIPS.map((chip) => (
                <XStack
                  key={chip}
                  flex={1}
                  paddingVertical={12}
                  alignItems="center"
                  justifyContent="center"
                  borderRadius="$control"
                  borderWidth={1}
                  borderColor={!useCustom && chipAmount === chip ? '$accent600' : '$neutral300'}
                  backgroundColor={!useCustom && chipAmount === chip ? '$accent50' : '$neutral0'}
                  onPress={() => {
                    setUseCustom(false);
                    setChipAmount(chip);
                  }}
                >
                  <NumericText
                    fontWeight="600"
                    color={!useCustom && chipAmount === chip ? '$accent600' : '$neutral900'}
                  >
                    {chip}
                  </NumericText>
                </XStack>
              ))}
              <XStack
                flex={1}
                paddingVertical={12}
                alignItems="center"
                justifyContent="center"
                borderRadius="$control"
                borderWidth={1}
                borderColor={useCustom ? '$accent600' : '$neutral300'}
                backgroundColor={useCustom ? '$accent50' : '$neutral0'}
                onPress={() => setUseCustom(true)}
              >
                <Text fontWeight="600" color={useCustom ? '$accent600' : '$neutral900'}>
                  Autre
                </Text>
              </XStack>
            </XStack>
            {useCustom && (
              <FormField
                label="Montant personnalisé"
                value={customAmount}
                onChangeText={setCustomAmount}
                keyboardType="numeric"
                error={formError ?? undefined}
              />
            )}
            {exceedsNetWarning && (
              <Text fontSize={12} color="$warning">
                Ce montant dépasse le net estimé restant pour ce travailleur (
                {selectedWorkerNet?.toFixed(0)} TND). Vous pouvez continuer si c'est voulu.
              </Text>
            )}
          </YStack>

          <FormField
            label="Raison (optionnel)"
            value={reason}
            onChangeText={setReason}
            placeholder="Ex : avance sur salaire"
          />

          {/* Only shown when the error isn't already routed to the
              custom-amount field above (worker-not-selected, or a chip
              amount that failed a check that isn't field-specific). */}
          {formError && !useCustom && <Text color="$danger">{formError}</Text>}

          <Button onPress={handleCreateAdvance} loading={savingAdvance}>
            Confirmer l'avance
          </Button>
        </YStack>
      </Sheet>

      <ConfirmTypingDialog
        visible={pendingTier3Action !== null}
        title={
          pendingTier3Action?.kind === 'approve'
            ? 'Approuver la demande ?'
            : pendingTier3Action?.kind === 'reject'
              ? 'Refuser la demande ?'
              : 'Marquer comme payé ?'
        }
        description={
          pendingTier3Action?.kind === 'approve'
            ? `Vous êtes sur le point d'approuver la demande d'avance de ${pendingTier3Action.workerName}.`
            : pendingTier3Action?.kind === 'reject'
              ? `Vous êtes sur le point de refuser la demande d'avance de ${pendingTier3Action.workerName}.`
              : pendingTier3Action?.kind === 'markPaid'
                ? `Vous êtes sur le point de marquer le cycle de paie de ${pendingTier3Action.workerName} comme payé.`
                : undefined
        }
        confirmValue={pendingTier3Action?.workerName ?? ''}
        confirmLabel={
          pendingTier3Action?.kind === 'approve'
            ? 'Approuver'
            : pendingTier3Action?.kind === 'reject'
              ? 'Refuser'
              : 'Marquer comme payé'
        }
        destructive={pendingTier3Action?.kind === 'reject'}
        loading={tier3Busy}
        requireReason
        onConfirm={handleConfirmTier3Action}
        onCancel={() => setPendingTier3Action(null)}
      />
    </YStack>
  );
}

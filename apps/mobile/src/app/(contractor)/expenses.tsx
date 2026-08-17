import { color } from '@dala/design-tokens';
import type { ExpenseCategory, Project, ProjectExpense } from '@dala/shared-types';
import { createProjectExpenseSchema } from '@dala/validation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, CoinsIcon, PlusIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { DonutChart } from '@/components/ui/Chart';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { calculateConsumedPercent, calculateConsumedTotal } from '@/lib/budget';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/expenses.tsx
 *
 * Doc 03 §3.10.3a — "the 'Dépenses' tab's content." The spec nests this
 * inside Project Detail, which didn't exist through Phase 9 (`projects.tsx`
 * was still the Phase-1 stub — full Projects CRUD was never scheduled as
 * its own Phase 1/2 line item, see the roadmap). Phase 10 adds
 * `project/[id].tsx` (Doc 03 §3.10.2's hub); this screen now accepts an
 * optional `project_id` deep-link param from it and locks to that project
 * (chip-row picker hidden, back arrow returns to the hub) instead of
 * showing its own picker. Opened directly (no param — still reachable from
 * the tab bar / existing nav for now), it falls back to the original
 * standalone picker behavior unchanged — this is additive, not a rewrite.
 *
 * Doc 01 §1.14.2 (referenced from Doc 02, since the section itself is
 * missing from the current Doc 01 — see delivery notes): worker
 * payroll/advances are excluded from the consumed-% calculation, which is
 * why this screen only ever sums `project_expenses`, never touches
 * `advances`.
 *
 * UI/UX pass: the consumed-total card was a single flat bar with a raw
 * number — real `category` data existed on every expense row but had
 * nowhere to surface in aggregate (each row showed its own category as
 * plain text only). Adds a `DonutChart` category breakdown above the list,
 * pull-to-refresh, and replaces the free-text "AAAA-MM-JJ" date field
 * (called out in this file's own prior comment as a deferred item) with
 * the new `DatePicker` — same native dependency already added for
 * `TimeInput`, no new module.
 */
const CATEGORY_CHART_COLOR: Record<ExpenseCategory, string> = {
  materiaux: color.accent[600],
  carburant: color.accent[300],
  sous_traitance: color.status.warning,
  autre: color.neutral[300],
};
const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string; color: string }[] = [
  { value: 'materiaux', label: 'Matériaux', color: '$accent600' },
  { value: 'carburant', label: 'Carburant', color: '$accent600' },
  { value: 'sous_traitance', label: 'Sous-traitance', color: '$accent600' },
  { value: 'autre', label: 'Autre', color: '$accent600' },
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  materiaux: 'Matériaux',
  carburant: 'Carburant',
  sous_traitance: 'Sous-traitance',
  autre: 'Autre',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesScreen() {
  const toast = useToast();
  const { project_id: deepLinkProjectId } = useLocalSearchParams<{ project_id?: string }>();
  const [canWrite, setCanWrite] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('materiaux');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedProjectId) void loadExpenses(selectedProjectId);
    }, [selectedProjectId]),
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
    const role = await getMyOrgRole(org);
    setCanWrite(role === 'owner' || role === 'manager');

    const { data: projectRows } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .is('deleted_at', null)
      .order('name');
    const list = projectRows ?? [];
    setProjects(list);
    if (list.length > 0) {
      const initial =
        deepLinkProjectId && list.some((p) => p.id === deepLinkProjectId)
          ? deepLinkProjectId
          : (list[0] as Project).id;
      setSelectedProjectId((current) => current ?? initial);
      await loadExpenses(initial);
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function loadExpenses(projectId: string) {
    const { data } = await supabase
      .from('project_expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });
    setExpenses(data ?? []);
  }

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const consumedTotal = useMemo(() => calculateConsumedTotal(expenses), [expenses]);
  const consumedPercent = calculateConsumedPercent(consumedTotal, selectedProject?.budget_total);

  // Category breakdown — real `category` data existed on every expense
  // row already; this is the first place it's ever aggregated rather than
  // just shown per-row as plain text.
  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] ?? 0) + Number(e.amount);
    });
    return (Object.keys(totals) as ExpenseCategory[])
      .map((cat) => ({
        label: CATEGORY_LABEL[cat],
        value: totals[cat]!,
        color: CATEGORY_CHART_COLOR[cat],
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  function openSheet() {
    setCategory('materiaux');
    setAmount('');
    setDescription('');
    setExpenseDate(todayISO());
    setError(null);
    setSheetOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!selectedProjectId) return;
    if (!orgId) return;

    const parsed = createProjectExpenseSchema.safeParse({
      project_id: selectedProjectId,
      category,
      amount: amount ? Number(amount) : undefined,
      description: description || undefined,
      expense_date: expenseDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Merci d'indiquer un montant valide.");
      haptics.error();
      return;
    }
    if (expenseDate > todayISO()) {
      setError('La date ne peut pas être dans le futur.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée.');

      const { error: insertError } = await supabase.from('project_expenses').insert({
        org_id: orgId,
        project_id: parsed.data.project_id,
        category: parsed.data.category,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
        expense_date: parsed.data.expense_date ?? todayISO(),
        created_by: session.user.id,
      });
      if (insertError) throw insertError;

      haptics.confirm();
      toast.success('Dépense enregistrée.');
      setSheetOpen(false);
      await loadExpenses(parsed.data.project_id);
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (projects.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={CoinsIcon}
          illustration="receipt"
          title="Aucun chantier"
          description="Créez d'abord un chantier pour pouvoir y suivre les dépenses."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        {deepLinkProjectId ? (
          <XStack alignItems="center" gap="$3" marginBottom="$4">
            <XStack
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <ArrowLeftIcon size={20} />
            </XStack>
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              Dépenses
            </Text>
          </XStack>
        ) : (
          <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
            Dépenses
          </Text>
        )}

        {!deepLinkProjectId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            <XStack gap="$2">
              {projects.map((p) => {
                const active = p.id === selectedProjectId;
                return (
                  <XStack
                    key={p.id}
                    paddingVertical={8}
                    paddingHorizontal={14}
                    borderRadius={999}
                    backgroundColor={active ? '$accent600' : '$neutral0'}
                    borderWidth={1}
                    borderColor={active ? '$accent600' : '$neutral300'}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text fontSize={13.5} fontWeight="500" color={active ? 'white' : '$neutral900'}>
                      {p.name}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>
          </ScrollView>
        )}

        {selectedProject && (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            marginBottom="$4"
            gap="$2"
          >
            <XStack justifyContent="space-between">
              <Text fontSize={13} color="$neutral500">
                Consommé
              </Text>
              <NumericText fontSize={13} fontWeight="600">
                {consumedTotal.toFixed(0)} TND
                {selectedProject.budget_total
                  ? ` / ${selectedProject.budget_total.toFixed(0)} TND`
                  : ''}
              </NumericText>
            </XStack>
            {consumedPercent !== null && (
              <View height={8} borderRadius={999} backgroundColor="$neutral100" overflow="hidden">
                <View
                  height={8}
                  borderRadius={999}
                  width={`${consumedPercent}%` as `${number}%`}
                  backgroundColor={consumedPercent >= 90 ? '$danger' : '$accent600'}
                />
              </View>
            )}
          </YStack>
        )}

        {/* Category breakdown — was entirely absent; every expense row
            already carried a `category` but it never got aggregated. */}
        {categoryBreakdown.length > 0 && (
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" marginBottom="$4">
            <Text
              fontSize={13}
              fontWeight="600"
              color="$neutral500"
              textTransform="uppercase"
              marginBottom="$3"
            >
              Répartition par catégorie
            </Text>
            <DonutChart
              segments={categoryBreakdown}
              centerValue={`${consumedTotal.toFixed(0)}`}
              centerLabel="TND"
            />
          </YStack>
        )}

        {expenses.length === 0 ? (
          <EmptyState
            icon={CoinsIcon}
            illustration="receipt"
            title="Aucune dépense"
            description={
              canWrite
                ? 'Ajoutez la première dépense de ce chantier avec le bouton +.'
                : "Aucune dépense enregistrée pour l'instant."
            }
          />
        ) : (
          <YStack gap="$2">
            {expenses.map((e) => (
              <XStack
                key={e.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$3"
                justifyContent="space-between"
                alignItems="center"
              >
                <YStack flex={1}>
                  <Text fontSize={15} fontWeight="600">
                    {CATEGORY_LABEL[e.category]}
                  </Text>
                  <Text fontSize={12} color="$neutral500">
                    {e.expense_date}
                    {e.description ? ` · ${e.description}` : ''}
                  </Text>
                </YStack>
                <NumericText fontSize={15.5} fontWeight="600">
                  {Number(e.amount).toFixed(0)} TND
                </NumericText>
              </XStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      {canWrite && (
        <FAB icon={PlusIcon} accessibilityLabel="Nouvelle dépense" onPress={openSheet} />
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Nouvelle dépense">
        <YStack gap="$3">
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Catégorie
            </Text>
            <SegmentedControl value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
          </YStack>

          <FormField
            label="Montant (TND)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />

          <FormField
            label="Description (optionnel)"
            value={description}
            onChangeText={setDescription}
            maxLength={200}
          />

          {/* Doc 03 §3.10.3a also specs a photo receipt here. Deferred in
              this pass — the receipt photo needs the same capture/
              compress/EXIF-strip pipeline as site logs (Doc 02 §2.5),
              which is scheduled for Phase 3 alongside Journal; building a
              one-off version just for this screen would fork that
              pipeline rather than reuse it. The date field itself is no
              longer deferred — see file header. */}
          <DatePicker
            label="Date"
            value={expenseDate}
            onChange={setExpenseDate}
            maximumDate={new Date()}
          />

          {error && <Text color="$danger">{error}</Text>}

          <Button onPress={handleSave} loading={saving}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}

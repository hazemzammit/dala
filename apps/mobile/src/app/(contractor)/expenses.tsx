import { color } from '@dala/design-tokens';
import type { ExpenseCategory, Project, ProjectExpense } from '@dala/shared-types';
import { createProjectExpenseSchema } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  CameraIcon,
  CoinsIcon,
  DotsThreeIcon,
  GasPumpIcon,
  HandshakeIcon,
  ImageIcon,
  PackageIcon,
  PlusIcon,
  TrashIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Image, Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { DonutChart } from '@/components/ui/Chart';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { ListCard } from '@/components/ui/ListCard';
import { NumericText } from '@/components/ui/NumericText';
import { SearchFilterBar } from '@/components/ui/SearchFilterBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useToast } from '@/components/ui/Toast';
import { useUndoToast, UndoToast } from '@/components/ui/UndoToast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { calculateConsumedPercent, calculateConsumedTotal } from '@/lib/budget';
import { useFabBottomContentInset } from '@/lib/fabLayout';
import { haptics } from '@/lib/haptics';
import { processPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, getSignedUrlMap, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

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
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.1, §9.2) —
 *
 *   - Search: a field above the category chip row, client-side over the
 *     already-fetched `expenses` list (`project_expenses` has no
 *     `search_vector` column — confirmed by reading its `create table` in
 *     migration 0007 directly — so this takes the same client-side route
 *     journal.tsx/materials.tsx do this phase, not vehicles.tsx's
 *     search_all route). Matches on category label + description.
 *   - Delete: §9.2 names an expense row as ITS OWN "lower-stakes delete"
 *     example — same UndoToast pattern as journal.tsx this phase (see that
 *     file's header for the full timing model), backed by
 *     `soft_delete_expense`/`restore_expense` (migration 0076). DISCLOSED
 *     SCOPE CUT: unlike vehicles/journal, this delete is NOT surfaced in
 *     trash.tsx — see migration 0076's own Part 2 header for why. `load()`
 *     Expenses query now also filters `.is('deleted_at', null)`, same
 *     convention this file's own `projects.deleted_at` filter above
 *     already uses.
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

/**
 * UI/UX pass — expense cards had zero iconography despite `category`
 * already having a real, deliberate accent mapping for the donut chart
 * above (`CATEGORY_CHART_COLOR`). Icon per category, tinted with the
 * `categorical` tokens (design-tokens' own comment on why 3 hues, not 4+
 * — `autre` deliberately stays neutral rather than inventing a 4th hue).
 */
const CATEGORY_ICON: Record<ExpenseCategory, typeof PackageIcon> = {
  materiaux: PackageIcon,
  carburant: GasPumpIcon,
  sous_traitance: HandshakeIcon,
  autre: DotsThreeIcon,
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesScreen() {
  const toast = useToast();
  const tc = useTokenColor();
  const categoryTint: Record<ExpenseCategory, string> = {
    materiaux: tc.categoricalAmber,
    carburant: tc.categoricalBlue,
    sous_traitance: tc.categoricalViolet,
    autre: tc.neutral500,
  };
  const { project_id: deepLinkProjectId } = useLocalSearchParams<{ project_id?: string }>();
  const [canWrite, setCanWrite] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fabBottomInset = useFabBottomContentInset();
  // Phase 20 (§1.7a) — the root `projects` query's error wasn't captured;
  // a failed fetch previously rendered as "Aucun chantier," indistinguishable
  // from a genuinely-empty org.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  // Bug fix: every expense row has a `receipt_photo_url`, but nothing on
  // this screen ever turned that path into a viewable signed URL or
  // rendered it anywhere — the receipt photo was uploaded successfully on
  // save and then effectively vanished. Batched the same way
  // team.tsx/vehicles.tsx already mint signed URLs for a list of photos.
  const [receiptUrlByPath, setReceiptUrlByPath] = useState<Record<string, string>>({});
  useEffect(() => {
    void getSignedUrlMap(expenses.map((e) => e.receipt_photo_url ?? null)).then(
      setReceiptUrlByPath,
    );
  }, [expenses]);
  // Detail modal — tapping a row now opens this instead of doing nothing,
  // per the request to see an expense's full details (including its
  // receipt photo) rather than just the summary line in the list.
  const [detailExpense, setDetailExpense] = useState<ProjectExpense | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('materiaux');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Phase 3 §1.8 — receiptLocalUri is a local preview of a freshly-picked-
  // but-not-yet-uploaded photo (uploaded at save time, same
  // upload-on-save-not-on-pick pattern as vehicles.tsx, so a cancelled
  // sheet never orphans a Storage file).
  const [receiptLocalUri, setReceiptLocalUri] = useState<string | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);

  // Phase 11 §9.1 — client-side search state, see file header.
  const [search, setSearch] = useState('');

  // Phase 11 §9.2 — optimistic soft-delete + UndoToast state, mirroring
  // journal.tsx's own pendingDeleteLog/undoToast pair exactly (see that
  // file's header for the full timing model this mirrors).
  const undoToast = useUndoToast();
  const [pendingDeleteExpense, setPendingDeleteExpense] = useState<ProjectExpense | null>(null);

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
    setLoadError(false);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const role = await getMyOrgRole(org);
    setCanWrite(role === 'owner' || role === 'manager');

    const { data: projectRows, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .is('deleted_at', null)
      .order('name');
    if (projectsError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
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
      // Phase 11 §9.2 — project_expenses.deleted_at (migration 0076); no
      // SELECT-policy change needed, filtered client-side same convention
      // this file's own load() already applies to projects.deleted_at.
      .is('deleted_at', null)
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

  // IMPROVEMENT-PLAN PHASE 4 (§3, prefill/suggestion layer) — "a remembered
  // last-amount hint for recurring expense categories (expenses.tsx — likely
  // the most recent amount for the same category+project_id)."
  // Derived from the already-loaded `expenses` (already sorted by
  // expense_date desc, created_at desc, so the first match per category
  // IS the most recent one) — no new query needed.
  const lastAmountByCategory = useMemo((): Partial<Record<ExpenseCategory, number>> => {
    const result: Partial<Record<ExpenseCategory, number>> = {};
    for (const e of expenses) {
      if (!(e.category in result)) {
        result[e.category] = Number(e.amount);
      }
    }
    return result;
  }, [expenses]);

  const suggestedAmount = selectedProjectId ? (lastAmountByCategory[category] ?? null) : null;

  // Phase 11 §9.1 — search applies only to the RENDERED list, not to
  // consumedTotal/categoryBreakdown above (both intentionally still
  // computed over the full `expenses` list — a search filter narrowing
  // which rows are visible should never make the budget summary lie).
  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((e) => {
      const haystack = `${CATEGORY_LABEL[e.category]} ${e.description ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [expenses, search]);

  // Phase 11 §9.2 — optimistic soft-delete + UndoToast. Same timing model
  // as journal.tsx's handleDeleteLog/handleUndoDeleteLog/handleDeleteLog
  // Expired trio this same phase (see UndoToast.tsx's own header) — the
  // RPC fires immediately, the row is pulled from `expenses` right away,
  // and "Annuler" calls restore_expense to reverse both.
  async function handleDeleteExpense(expense: ProjectExpense) {
    try {
      const { error } = await supabase.rpc('soft_delete_expense', { p_expense_id: expense.id });
      if (error) throw error;
      haptics.confirm();
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      setPendingDeleteExpense(expense);
      undoToast.show(expense.id, 'Dépense supprimée.');
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de supprimer cette dépense.');
    }
  }

  async function handleUndoDeleteExpense() {
    if (!pendingDeleteExpense) return;
    const restored = pendingDeleteExpense;
    try {
      const { error } = await supabase.rpc('restore_expense', { p_expense_id: restored.id });
      if (error) throw error;
      haptics.confirm();
      toast.success('Dépense restaurée.');
      setPendingDeleteExpense(null);
      undoToast.clear();
      if (selectedProjectId) await loadExpenses(selectedProjectId);
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de restaurer cette dépense.');
    }
  }

  function handleDeleteExpenseExpired() {
    setPendingDeleteExpense(null);
    undoToast.clear();
  }

  function openSheet() {
    setCategory('materiaux');
    setAmount('');
    setDescription('');
    setExpenseDate(todayISO());
    setError(null);
    setReceiptLocalUri(null);
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

      // Phase 3 §1.8 — the gap this screen's own prior comment flagged:
      // upload now happens, using the exact pipeline every other photo
      // field in this app uses (processPhoto — general-purpose, not
      // processAvatarPhoto's square identity crop; a receipt is a
      // document photo, not an avatar).
      let receiptPath: string | null = null;
      if (receiptLocalUri) {
        receiptPath = await uploadOrgFile(orgId, 'expenses', receiptLocalUri, 'jpg', 'image/jpeg');
      }

      const { error: insertError } = await supabase.from('project_expenses').insert({
        org_id: orgId,
        project_id: parsed.data.project_id,
        category: parsed.data.category,
        amount: parsed.data.amount,
        description: parsed.data.description ?? null,
        expense_date: parsed.data.expense_date ?? todayISO(),
        created_by: session.user.id,
        receipt_photo_url: receiptPath,
      });
      if (insertError) throw insertError;

      haptics.confirm();
      toast.success('Dépense enregistrée.');
      setSheetOpen(false);
      setReceiptLocalUri(null);
      await loadExpenses(parsed.data.project_id);
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  async function pickReceipt(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error(
        source === 'camera'
          ? "Autorisez l'accès à l'appareil photo pour prendre une photo."
          : "Autorisez l'accès à vos photos pour en choisir une.",
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setProcessingReceipt(true);
    try {
      const processed = await processPhoto(result.assets[0].uri);
      setReceiptLocalUri(processed.uri);
    } catch {
      toast.error('Impossible de traiter la photo. Réessayez.');
    } finally {
      setProcessingReceipt(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
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
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottomInset }}
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
            <Icon3D name="upload-file" size={28} />
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              Dépenses
            </Text>
          </XStack>
        ) : (
          <XStack alignItems="center" gap="$2" marginBottom="$4">
            <Icon3D name="upload-file" size={40} />
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              Dépenses
            </Text>
          </XStack>
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
            {/* Phase 11 §9.1 — search field, above the expense list.
                UI/UX pass: now on SearchFilterBar for the same
                fixed-height treatment as the other list screens. */}
            <YStack marginBottom="$1">
              <SearchFilterBar
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher une dépense"
              />
            </YStack>
            {filteredExpenses.length === 0 ? (
              <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$4">
                Aucune dépense ne correspond à cette recherche.
              </Text>
            ) : (
              filteredExpenses.map((e) => (
                <SwipeableRow
                  key={e.id}
                  rightAction={
                    canWrite
                      ? {
                          label: 'Supprimer',
                          color: color.status.danger,
                          icon: TrashIcon,
                          onPress: () => void handleDeleteExpense(e),
                        }
                      : undefined
                  }
                >
                  {/* UI/UX pass — composes the shared `ListCard`, same as
                      Chantiers/Avances/Matériaux/Véhicules/Équipe. Icon
                      chip now carries the category (see CATEGORY_ICON
                      above) instead of a plain text row. */}
                  <ListCard
                    icon={CATEGORY_ICON[e.category]}
                    iconTint={categoryTint[e.category]}
                    title={CATEGORY_LABEL[e.category]}
                    subtitle={`${e.expense_date}${e.description ? ` · ${e.description}` : ''}`}
                    badge={
                      <NumericText fontSize={15.5} fontWeight="600">
                        {Number(e.amount).toFixed(0)} TND
                      </NumericText>
                    }
                    onPress={() => setDetailExpense(e)}
                  />
                </SwipeableRow>
              ))
            )}
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

          <YStack gap="$1.5">
            <FormField
              label="Montant (TND)"
              icon={CoinsIcon}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
            {/* IMPROVEMENT-PLAN PHASE 4 (§3) — last-amount hint: shown only
                while the field is still empty, so it never overwrites a
                value the user already typed. Same tap-to-fill pattern as
                team.tsx's trade rate hint — suggestion, not a hard prefill. */}
            {suggestedAmount !== null && !amount && (
              <XStack
                alignItems="center"
                gap={4}
                onPress={() => setAmount(String(suggestedAmount))}
                accessibilityRole="button"
              >
                <Text fontSize={12.5} color="$neutral500">
                  Dernier montant pour {CATEGORY_LABEL[category]} : {suggestedAmount.toFixed(0)} TND
                  ·
                </Text>
                <Button variant="chip" fullWidth={false}>
                  Utiliser
                </Button>
              </XStack>
            )}
          </YStack>

          <FormField
            label="Description (optionnel)"
            value={description}
            onChangeText={setDescription}
            maxLength={200}
          />

          {/* IMPROVEMENT-PLAN PHASE 3 (§1.8) — the gap flagged in this
              comment's prior text is closed: same processPhoto/
              uploadOrgFile pipeline every other photo field in this app
              uses, upload deferred to save time (handleSave), not pick
              time, so a cancelled sheet never orphans a Storage file. */}
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="500">
              Photo du reçu
            </Text>
            {receiptLocalUri ? (
              <XStack alignItems="center" gap="$3">
                <Image source={{ uri: receiptLocalUri }} width={72} height={72} borderRadius={12} />
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setReceiptLocalUri(null)}
                >
                  Retirer
                </Button>
              </XStack>
            ) : (
              <XStack gap="$2">
                <Button
                  variant="secondary"
                  shareRow
                  icon={CameraIcon}
                  loading={processingReceipt}
                  onPress={() => void pickReceipt('camera')}
                >
                  Appareil photo
                </Button>
                <Button
                  variant="secondary"
                  shareRow
                  icon={ImageIcon}
                  loading={processingReceipt}
                  onPress={() => void pickReceipt('library')}
                >
                  Galerie
                </Button>
              </XStack>
            )}
          </YStack>

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

      {/* Detail modal — shows the full expense, including its receipt
          photo (previously uploaded but never displayed anywhere). */}
      <Sheet
        visible={!!detailExpense}
        onClose={() => setDetailExpense(null)}
        title={detailExpense ? CATEGORY_LABEL[detailExpense.category] : ''}
      >
        {detailExpense && (
          <YStack gap="$3">
            <XStack justifyContent="space-between" alignItems="center">
              <Text color="$neutral500" fontSize={14}>
                Montant
              </Text>
              <NumericText fontSize={20} fontWeight="700">
                {Number(detailExpense.amount).toFixed(0)} TND
              </NumericText>
            </XStack>
            <XStack justifyContent="space-between" alignItems="center">
              <Text color="$neutral500" fontSize={14}>
                Date
              </Text>
              <Text fontSize={14}>{detailExpense.expense_date}</Text>
            </XStack>
            {detailExpense.description && (
              <YStack gap="$1">
                <Text color="$neutral500" fontSize={14}>
                  Description
                </Text>
                <Text fontSize={14}>{detailExpense.description}</Text>
              </YStack>
            )}
            <YStack gap="$1.5">
              <Text color="$neutral500" fontSize={14}>
                Reçu
              </Text>
              {detailExpense.receipt_photo_url &&
              receiptUrlByPath[detailExpense.receipt_photo_url] ? (
                <Image
                  src={receiptUrlByPath[detailExpense.receipt_photo_url]}
                  width="100%"
                  height={240}
                  borderRadius={12}
                  resizeMode="contain"
                  backgroundColor="$neutral25"
                />
              ) : (
                <Text color="$neutral400" fontSize={14}>
                  Aucun reçu joint.
                </Text>
              )}
            </YStack>
          </YStack>
        )}
      </Sheet>

      {/* Phase 11 §9.2 — undo-toast for the delete flow above. */}
      <UndoToast
        visible={!!undoToast.pending}
        message={undoToast.pending?.message ?? ''}
        onUndo={handleUndoDeleteExpense}
        onExpire={handleDeleteExpenseExpired}
      />
    </YStack>
  );
}

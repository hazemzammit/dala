import type { ExpenseCategory, Project, ProjectExpense } from '@dala/shared-types';
import { createProjectExpenseSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { CoinsIcon, PlusIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/expenses.tsx
 *
 * Doc 03 §3.10.3a — "the 'Dépenses' tab's content." The spec nests this
 * inside Project Detail, which doesn't exist yet (`projects.tsx` is still
 * the Phase-1 stub — full Projects CRUD was never scheduled as its own
 * Phase 1/2 line item, see the roadmap). Building a standalone screen with
 * a project picker at the top instead of scope-creeping into Projects
 * CRUD to give this a parent screen — this is a deliberate simplification,
 * called out in the delivery notes, not an oversight.
 *
 * Doc 01 §1.14.2 (referenced from Doc 02, since the section itself is
 * missing from the current Doc 01 — see delivery notes): worker
 * payroll/advances are excluded from the consumed-% calculation, which is
 * why this screen only ever sums `project_expenses`, never touches
 * `advances`.
 */
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
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
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

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
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
      setSelectedProjectId((current) => current ?? list[0]!.id);
      await loadExpenses((list[0] as Project).id);
    }
    setLoading(false);
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

  const consumedTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );
  const consumedPercent =
    selectedProject?.budget_total && selectedProject.budget_total > 0
      ? Math.min(100, Math.round((consumedTotal / selectedProject.budget_total) * 100))
      : null;

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Dépenses
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
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

          {/* Doc 03 §3.10.3a also specs a photo receipt + native date
              picker here. Deferred in this pass — the receipt photo needs
              the same capture/compress/EXIF-strip pipeline as site logs
              (Doc 02 §2.5), which is scheduled for Phase 3 alongside
              Journal; building a one-off version just for this screen
              would fork that pipeline rather than reuse it. The date
              defaults to today (editable as text below) with a
              not-in-the-future check enforced on save. */}
          <FormField
            label="Date (AAAA-MM-JJ)"
            value={expenseDate}
            onChangeText={setExpenseDate}
            autoCapitalize="none"
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

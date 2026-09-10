import { color } from '@dala/design-tokens';
import type { Material, Project, Worker } from '@dala/shared-types';
import {
  createMaterialRequestSchema,
  reassignMaterialSchema,
  refuseMaterialSchema,
  setMaterialCostSchema,
} from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import {
  BuildingsIcon,
  CheckIcon,
  CoinsIcon,
  PackageIcon,
  PlusIcon,
  UserSwitchIcon,
  XIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { ListCard } from '@/components/ui/ListCard';
import { NumericText } from '@/components/ui/NumericText';
import { SearchFilterBar } from '@/components/ui/SearchFilterBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { useFabBottomContentInset } from '@/lib/fabLayout';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { MATERIAL_OPTIONS } from '@/lib/pickerOptions';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/materials.tsx
 *
 * Doc 03 §3.15 — list with a pending-count badge, En attente/Approuvé/
 * Refusé filter; request detail with item/quantity/urgency/requesting
 * worker/note; Approuver / Refuser (reason, min 3 chars) / Réassigner
 * (worker picker).
 *
 * Refuse/reassign are still plain updates under the existing
 * `materials_write_owner_manager` RLS policy — unlike advances, neither
 * moves money or resolves an ambiguous caller identity server-side.
 *
 * IMPROVEMENT-PLAN PHASE 8 (§1.9) — this file's own prior comment here
 * predicted exactly this: "if a future pass adds a cost field and wires
 * approval to the expense ledger, THAT'S the point this action needs to
 * move behind an idempotent RPC (mirroring create_advance/approve_
 * advance)." migration 0073 adds `materials.cost` and
 * `approve_material_request()` (idempotency-checked, mirrors
 * approve_advance exactly) — `handleApprove` below now calls that RPC
 * instead of a plain update. Setting/editing `cost` itself stays a plain
 * update (no RPC — the column needs no RLS change, migration 0073's own
 * comment on it), same as refuse/reassign.
 *
 * §1.9 item 1 ("let the contractor initiate a material request directly")
 * is the new FAB + create sheet below. No new RLS policy was needed —
 * `materials_write_owner_manager` is `for all` with no separate `with
 * check`, so an owner/manager could already INSERT (Postgres RLS uses
 * `using` as the check for INSERT when no `with check` is given) —
 * confirmed by reading the policy directly before concluding this rather
 * than assuming a policy gap existed. `createMaterialRequestSchema`
 * (packages/validation/src/fieldOps.ts) is a SEPARATE schema from the
 * worker-side `requestMaterialSchema` — see that schema's own header for
 * why.
 *
 * No per-project filter on this screen, unlike Journal/Safety/Expenses —
 * Doc 03 §3.15 describes a flat "list … filter (En attente/Approuvé/
 * Refusé)" with no project grouping, so this stays a single org-wide
 * queue. The contractor-create sheet's own project picker is optional for
 * the same reason materials.project_id itself is nullable.
 *
 * PHASE 19 SCOPE NOTE: this screen was deliberately left OUT of the
 * offline-first routing pass. Approve/refuse/reassign are all UPDATEs on
 * an already-created row, performed by a contractor — exactly the
 * "editable-record… but the actor is always online" case Doc 01 §1.9
 * draws a line around for the append-only tables (creation can happen
 * offline in the field; approval is office/admin work). Routing these
 * through WatermelonDB would mean building local update-conflict handling
 * for a scenario that doesn't arise in this app's actual usage pattern —
 * not free, and not something to add speculatively.
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.1) — search field above the status filter,
 * client-side over the already-fetched org-wide `materials` list.
 * `materials` has NO `search_vector` column (confirmed by reading its
 * `create table` in migration 0008 directly, not assumed from the plan's
 * own claim) — going the `search_all` route the way vehicles.tsx does
 * this same phase would need a new migration adding one; client-side
 * filtering is the same "simpler, and fine at the list sizes one org
 * actually has" precedent projects.tsx's own header comment already
 * establishes, and this screen's list is smaller still (materials
 * requests, not every project). Matches on item name, note, and the
 * requesting worker's resolved name (`requestingWorkerName()`, already
 * defined below).
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
  const toast = useToast();
  const tc = useTokenColor();
  const [loading, setLoading] = useState(true);
  const fabBottomInset = useFabBottomContentInset();
  // Phase 20 (§1.7a) — same fix as safety/expenses/collaboration: the
  // three parallel root queries had no error capture.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  // Phase 11 §9.1 — client-side search state, see file header.
  const [search, setSearch] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [refuseSheetOpen, setRefuseSheetOpen] = useState(false);
  // Doc 05 §1.7c (Tier 2, Phase 19C) — Approve gates through the existing
  // shared ConfirmDialog now, reused as-is rather than rebuilt.
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [reassignSheetOpen, setReassignSheetOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Phase 8 §1.9 item 1 — contractor-initiated create sheet.
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createItem, setCreateItem] = useState('');
  const [createQuantity, setCreateQuantity] = useState('');
  const [createUrgency, setCreateUrgency] = useState<'normal' | 'urgent'>('normal');
  const [createProjectId, setCreateProjectId] = useState<string | null>(null);
  const [createCost, setCreateCost] = useState('');
  const [createNote, setCreateNote] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Phase 8 §1.9 item 2 — cost/project editing on a pending request, shown
  // in the detail sheet. Seeded from `detail` when the sheet opens.
  const [editCost, setEditCost] = useState('');
  const [editProjectId, setEditProjectId] = useState<string | null>(null);

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
      { data: materialRows, error: materialsError },
      { data: workerRows, error: workersError },
      { data: projectRows, error: projectsError },
    ] = await Promise.all([
      supabase
        .from('materials')
        .select('*')
        .eq('org_id', org)
        .order('created_at', { ascending: false }),
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
      // Phase 8 §1.9 item 1 — project picker for the contractor-create
      // sheet and the detail sheet's project-linking editor.
      supabase
        .from('projects')
        .select('*')
        .eq('lead_org_id', org)
        .is('deleted_at', null)
        .order('name'),
    ]);
    if (materialsError || workersError || projectsError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setMaterials((materialRows as Material[] | null) ?? []);
    setWorkers((workerRows as Worker[] | null) ?? []);
    setProjects((projectRows as Project[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
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
  // Phase 11 §9.1 — search applies alongside the existing status filter.
  // Inlines the same created_by -> workerByUserId resolution
  // requestingWorkerName() (below) uses, since that function is declared
  // after this memo and workerByUserId is already in scope here.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (m.status !== filter) return false;
      if (!q) return true;
      const requesterName = m.created_by
        ? (workerByUserId[m.created_by]?.full_name ?? 'Contractant')
        : 'Contractant';
      const haystack = `${m.item} ${m.note ?? ''} ${requesterName}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [materials, filter, search, workerByUserId]);
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
    const m = materials.find((mat) => mat.id === id);
    setEditCost(m?.cost != null ? String(m.cost) : '');
    setEditProjectId(m?.project_id ?? null);
  }

  /** Phase 8 §1.9 item 2 — persists cost/project edits made in the detail
   * sheet BEFORE approving, so approve_material_request() sees the
   * up-to-date values when it decides whether to push a project_expenses
   * row. A plain update (no RPC — see file header). Silently a no-op
   * (returns true) if neither field actually changed, so handleApprove
   * can always call this first without an extra dirty-check. */
  async function persistCostAndProjectEdits(materialId: string): Promise<boolean> {
    const parsed = setMaterialCostSchema.safeParse({
      material_id: materialId,
      cost: editCost.trim() ? Number(editCost) : null,
      project_id: editProjectId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Coût invalide.');
      return false;
    }
    const { error: updateError } = await supabase
      .from('materials')
      .update({ cost: parsed.data.cost, project_id: parsed.data.project_id })
      .eq('id', parsed.data.material_id);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function handleApprove(materialId: string) {
    if (actionLoadingId) return;
    setActionLoadingId(materialId);
    setError(null);
    try {
      const persisted = await persistCostAndProjectEdits(materialId);
      if (!persisted) {
        haptics.error();
        return;
      }

      const { data, error: rpcError } = await supabase
        .rpc('approve_material_request', {
          p_material_id: materialId,
          p_idempotency_key: newIdempotencyKey(),
        })
        .single();
      if (rpcError) throw rpcError;

      haptics.confirm();
      const result = data as {
        expense_pushed: boolean;
        expense_skipped_reason: string | null;
      } | null;
      if (result?.expense_pushed) {
        toast.success('Demande approuvée — dépense ajoutée au chantier.');
      } else if (result?.expense_skipped_reason === 'no_project_linked') {
        toast.success('Approuvé, mais non ajouté aux dépenses (aucun chantier associé).');
      } else {
        toast.success('Demande approuvée.');
      }
      setDetailId(null);
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? "Impossible d'approuver cette demande.");
    } finally {
      setActionLoadingId(null);
    }
  }

  /** Phase 8 §1.9 item 1 — contractor-initiated request. A plain live
   * insert under materials_write_owner_manager (no new policy needed —
   * see file header), NOT routed through WatermelonDB — this screen was
   * already deliberately left out of the offline-first routing pass
   * (Phase 19 scope note above), and a contractor creating a request from
   * this office-facing screen is the same "actor is always online" case
   * that note already draws the line around for approve/refuse/reassign. */
  function openCreateSheet() {
    setCreateItem('');
    setCreateQuantity('');
    setCreateUrgency('normal');
    setCreateProjectId(null);
    setCreateCost('');
    setCreateNote('');
    setCreateError(null);
    setCreateSheetOpen(true);
  }

  async function handleCreate() {
    if (!orgId) return;
    setCreateError(null);
    const parsed = createMaterialRequestSchema.safeParse({
      project_id: createProjectId ?? undefined,
      item: createItem,
      quantity: createQuantity.trim() ? Number(createQuantity) : undefined,
      urgency: createUrgency,
      note: createNote.trim() || undefined,
      cost: createCost.trim() ? Number(createCost) : undefined,
    });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.');
      haptics.error();
      return;
    }

    setCreating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error: insertError } = await supabase.from('materials').insert({
        org_id: orgId,
        project_id: parsed.data.project_id ?? null,
        item: parsed.data.item,
        quantity: parsed.data.quantity ?? null,
        urgency: parsed.data.urgency,
        note: parsed.data.note ?? null,
        cost: parsed.data.cost ?? null,
        status: 'pending',
        created_by: session?.user.id ?? null,
      });
      if (insertError) throw insertError;
      haptics.confirm();
      toast.success('Demande créée.');
      setCreateSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setCreateError(e?.message ?? 'Impossible de créer cette demande.');
    } finally {
      setCreating(false);
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
      toast.success('Demande refusée.');
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
      toast.success('Demande réassignée.');
      setReassignSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de réassigner cette demande.');
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

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
      </YStack>
    );
  }

  if (materials.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={PackageIcon}
          icon3d="to-do-list"
          title="Aucune demande de matériaux"
          description="Les demandes de matériaux de vos chantiers apparaîtront ici."
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

        <YStack marginBottom="$4" gap="$2.5">
          {/* Phase 11 §9.1 — search field. UI/UX pass: now on
              SearchFilterBar (components/ui/SearchFilterBar.tsx) for the
              same fixed-height, consistent-radius treatment as Chantiers
              — no filter button here (SegmentedControl below already
              covers status filtering for this screen), so it renders as
              a search-only bar. */}
          <SearchFilterBar
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un article ou un travailleur"
          />
          <SegmentedControl value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
        </YStack>

        {filtered.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune demande dans cette catégorie.
          </Text>
        ) : (
          <YStack gap="$2">
            {/* UI/UX pass — composes the shared `ListCard` (see Chantiers/
                Avances) instead of a hand-rolled row: icon chip tinted
                danger for urgent requests (so urgency is visible at a
                glance, not only inside a badge) or the materials
                categorical amber otherwise, requesting-worker + quantity
                as a metadata row, status badge in the header. */}
            {filtered.map((m) => (
              <ListCard
                key={m.id}
                icon={PackageIcon}
                iconTint={m.urgency === 'urgent' ? tc.danger : tc.categoricalAmber}
                title={m.item}
                onPress={() => openDetail(m.id)}
                metaItems={[
                  { icon: UserSwitchIcon, label: requestingWorkerName(m) },
                  ...(m.quantity != null
                    ? [{ icon: PackageIcon, label: `Qté ${m.quantity}` }]
                    : []),
                ]}
                badge={
                  <XStack gap="$2">
                    {m.urgency === 'urgent' && <StatusBadge variant="danger">Urgent</StatusBadge>}
                    <StatusBadge variant={STATUS_VARIANT[m.status]}>
                      {STATUS_LABEL[m.status]}
                    </StatusBadge>
                  </XStack>
                }
              />
            ))}
          </YStack>
        )}
      </ScrollView>

      <FAB icon={PlusIcon} accessibilityLabel="Créer une demande" onPress={openCreateSheet} />

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
              <YStack gap="$3" marginTop="$2">
                {/* Phase 8 §1.9 item 2 — cost + project linking, edited
                    here before approving so approve_material_request()
                    sees the values a contractor just entered. Both fields
                    stay editable even if already set (e.g. a worker's
                    request has a project from their dispatch assignment
                    but no cost yet — the contractor only adds cost). */}
                <YStack gap="$1.5">
                  <Text fontSize={13} fontWeight="500" color="$neutral900">
                    Chantier
                  </Text>
                  <Select
                    label="Chantier"
                    icon={BuildingsIcon}
                    value={editProjectId}
                    onChange={setEditProjectId}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Aucun chantier associé"
                  />
                </YStack>
                <FormField
                  label="Coût (optionnel)"
                  icon={CoinsIcon}
                  value={editCost}
                  onChangeText={setEditCost}
                  keyboardType="numeric"
                  placeholder="Montant en TND"
                  error={error ?? undefined}
                />
                {editCost.trim() && !editProjectId && (
                  <Text fontSize={12} color="$neutral500">
                    Sans chantier associé, ce coût ne sera pas ajouté aux dépenses à l'approbation.
                  </Text>
                )}

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
                    onPress={() => setApproveConfirmOpen(true)}
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

      <ConfirmDialog
        visible={approveConfirmOpen}
        title="Approuver la demande ?"
        description={detail ? `Vous êtes sur le point d'approuver "${detail.item}".` : undefined}
        confirmLabel="Approuver"
        destructive={false}
        loading={Boolean(detail && actionLoadingId === detail.id)}
        onConfirm={() => {
          setApproveConfirmOpen(false);
          if (detail) void handleApprove(detail.id);
        }}
        onCancel={() => setApproveConfirmOpen(false)}
      />

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
            error={error ?? undefined}
          />
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

      {/* Phase 8 §1.9 item 1 — contractor-initiated request. */}
      <Sheet
        visible={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="Nouvelle demande de matériaux"
      >
        <YStack gap="$3">
          <Select
            label="Article"
            icon={PackageIcon}
            value={createItem || null}
            onChange={setCreateItem}
            options={MATERIAL_OPTIONS}
            placeholder="Choisir ou préciser…"
          />
          <FormField
            label="Quantité"
            value={createQuantity}
            onChangeText={setCreateQuantity}
            keyboardType="numeric"
          />
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Urgence
            </Text>
            <SegmentedControl
              value={createUrgency}
              options={[
                { value: 'normal' as const, label: 'Normal', color: '$neutral900' },
                { value: 'urgent' as const, label: 'Urgent', color: '$danger' },
              ]}
              onChange={setCreateUrgency}
            />
          </YStack>
          <Select
            label="Chantier (optionnel)"
            icon={BuildingsIcon}
            value={createProjectId}
            onChange={setCreateProjectId}
            options={projects.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Aucun chantier associé"
          />
          <FormField
            label="Coût (optionnel)"
            icon={CoinsIcon}
            value={createCost}
            onChangeText={setCreateCost}
            keyboardType="numeric"
            placeholder="Montant en TND"
          />
          <FormField
            label="Note (optionnel)"
            value={createNote}
            onChangeText={setCreateNote}
            maxLength={200}
          />
          {createError && <Text color="$danger">{createError}</Text>}
          <Button icon={PackageIcon} onPress={handleCreate} loading={creating}>
            Créer la demande
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}

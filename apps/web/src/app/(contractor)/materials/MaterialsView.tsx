'use client';

import type { ApprovalStatus, Material, Project } from '@dala/shared-types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  IconActionButton,
  StatusBadge,
} from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import type { CreateMaterialRequestInput, SetMaterialCostInput } from '@dala/validation';
import {
  CheckCircleIcon,
  PackageIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { approveMaterial, deleteMaterial, rejectMaterial } from './actions';
import { MaterialFormModal } from './MaterialFormModal';

import { SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

type CreateMaterialResult =
  { success: true; material: Material } | { success: false; error: string };
type ActionResult = { success: true } | { success: false; error: string };

type CreateMaterialAction = (input: CreateMaterialRequestInput) => Promise<CreateMaterialResult>;
type SetMaterialCostAction = (input: SetMaterialCostInput) => Promise<ActionResult>;

type ModalState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; material: Material };

type MaterialStatus = ApprovalStatus;
type MaterialUrgency = Material['urgency'];

type MaterialRow = Material & {
  projectName: string;
  quantityLabel: string;
};

const STATUS_LABEL: Record<MaterialStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

const STATUS_VARIANT: Record<MaterialStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const URGENCY_LABEL: Record<MaterialUrgency, string> = {
  normal: 'Normal',
  urgent: 'Urgent',
};

const URGENCY_VARIANT: Record<MaterialUrgency, 'neutral' | 'warning'> = {
  normal: 'neutral',
  urgent: 'warning',
};

function formatQuantity(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('fr-TN');
}

export function MaterialsView({
  materials,
  projects,
  createMaterial,
  setMaterialCost,
}: {
  materials: Material[];
  projects: Project[];
  createMaterial: CreateMaterialAction;
  setMaterialCost: SetMaterialCostAction;
}) {
  const [rows, setRows] = useState(materials);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    action: 'approve' | 'delete';
    material: MaterialRow;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const router = useRouter();

  // §2.4 — bulk-approve via checkbox multi-select. Same per-row
  // `approve_material_request` RPC the individual approve button already
  // calls, looped once per selected id — already idempotency-key-protected
  // per-call (0048), so this is safe without a new bulk RPC, per the guide.
  const [bulkConfirmIds, setBulkConfirmIds] = useState<string[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);

  useEffect(() => {
    setRows(materials);
  }, [materials]);

  const projectOptions = useMemo(() => {
    return projects
      .filter((project) => project.status === 'active')
      .map((project) => ({ id: project.id, name: project.name }));
  }, [projects]);

  const projectNameById = useMemo(() => {
    return new Map(projects.map((project) => [project.id, project.name]));
  }, [projects]);

  function upsertMaterial(material: Material) {
    setRows((current) => [material, ...current.filter((row) => row.id !== material.id)]);
  }

  const displayRows = useMemo<MaterialRow[]>(() => {
    return rows.map((material) => ({
      ...material,
      projectName: material.project_id ? (projectNameById.get(material.project_id) ?? '—') : '—',
      quantityLabel: formatQuantity(material.quantity),
    }));
  }, [rows, projectNameById]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.item, row.note ?? '', row.projectName].some((value) =>
          value.toLowerCase().includes(lower),
        );
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, query, statusFilter]);

  const columns: DataTableColumn<MaterialRow>[] = [
    {
      key: 'item',
      header: 'Matériau',
      render: (row) => (
        <div>
          <div className="font-medium text-neutral-900">{row.item}</div>
          <div className="text-xs text-neutral-500">{row.note ?? 'Aucune note'}</div>
        </div>
      ),
      sortValue: (row) => row.item,
    },
    {
      key: 'projectName',
      header: 'Chantier',
      render: (row) => row.projectName,
      sortValue: (row) => row.projectName,
    },
    {
      key: 'quantity',
      header: 'Quantité',
      render: (row) => row.quantityLabel,
      sortValue: (row) => row.quantity ?? 0,
      align: 'right',
    },
    {
      key: 'urgency',
      header: 'Urgence',
      render: (row) => (
        <StatusBadge variant={URGENCY_VARIANT[row.urgency]}>
          {URGENCY_LABEL[row.urgency]}
        </StatusBadge>
      ),
      sortValue: (row) => row.urgency,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <StatusBadge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</StatusBadge>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'created_at',
      header: 'Créé le',
      render: (row) => new Date(row.created_at).toLocaleDateString('fr-TN'),
      sortValue: (row) => row.created_at,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'pending' && (
            <>
              <IconActionButton
                icon={CheckCircleIcon}
                label={`Approuver ${row.item}`}
                tone="success"
                size="sm"
                disabled={isPending && pendingId === row.id}
                onClick={() => {
                  setConfirmError(null);
                  setConfirm({ action: 'approve', material: row });
                }}
              />
              <button
                onClick={() => {
                  const reason = window.prompt(
                    `Motif du refus pour "${row.item}" (3 caractères min.) :`,
                  );
                  if (!reason || reason.trim().length < 3) return;
                  setPendingId(row.id);
                  startTransition(async () => {
                    const result = await rejectMaterial({
                      material_id: row.id,
                      rejection_reason: reason.trim(),
                    });
                    setPendingId(null);
                    if (!result.success) {
                      window.alert(result.error);
                      return;
                    }
                    setRows((current) =>
                      current.map((m) =>
                        m.id === row.id ? { ...m, status: 'rejected' as ApprovalStatus } : m,
                      ),
                    );
                    setNotice(`${row.item} refusé.`);
                  });
                }}
                disabled={isPending && pendingId === row.id}
                className="text-danger hover:bg-danger/10 rounded-control p-1.5 disabled:opacity-50"
                aria-label={`Refuser ${row.item}`}
              >
                <XCircleIcon size={16} />
              </button>
            </>
          )}
          <IconActionButton
            icon={PencilSimpleIcon}
            label={`Modifier ${row.item}`}
            tone="neutral"
            size="sm"
            onClick={() => setModalState({ mode: 'edit', material: row })}
          />
          <IconActionButton
            icon={TrashIcon}
            label={`Supprimer ${row.item}`}
            tone="danger"
            size="sm"
            disabled={isPending && pendingId === row.id}
            onClick={() => {
              setConfirmError(null);
              setConfirm({ action: 'delete', material: row });
            }}
          />
        </div>
      ),
    },
  ];

  const totalCount = filteredRows.length;

  async function handleConfirm() {
    if (confirm === null) return;
    const { action, material } = confirm;
    setConfirmError(null);
    setPendingId(material.id);

    if (action === 'approve') {
      startTransition(async () => {
        const result = await approveMaterial(material.id);
        setPendingId(null);
        if (!result.success) {
          setConfirmError(result.error);
          return;
        }
        setRows((current) =>
          current.map((m) =>
            m.id === material.id ? { ...m, status: 'approved' as ApprovalStatus } : m,
          ),
        );
        setNotice(
          result.expensePushed
            ? `${material.item} approuvé — dépense ajoutée au chantier.`
            : `${material.item} approuvé.`,
        );
        setConfirm(null);
      });
      return;
    }

    startTransition(async () => {
      const result = await deleteMaterial(material.id);
      setPendingId(null);
      if (!result.success) {
        setConfirmError(result.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== material.id));
      setNotice(`${material.item} a été retiré des matériaux.`);
      setConfirm(null);
    });
  }

  async function handleBulkApprove() {
    if (!bulkConfirmIds) return;
    setBulkRunning(true);
    setBulkErrors([]);
    const errors: string[] = [];

    for (const id of bulkConfirmIds) {
      const result = await approveMaterial(id);
      if (result.success) {
        setRows((current) =>
          current.map((m) => (m.id === id ? { ...m, status: 'approved' as ApprovalStatus } : m)),
        );
      } else {
        const item = rows.find((m) => m.id === id)?.item ?? id;
        errors.push(`${item} : ${result.error}`);
      }
    }

    setBulkRunning(false);
    setBulkErrors(errors);
    if (errors.length === 0) {
      setBulkConfirmIds(null);
      setNotice(`${bulkConfirmIds.length} demande(s) approuvée(s).`);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Inventaire"
        title="Matériaux"
        description="Suivez les stocks, les fournisseurs et les coûts d’achat sur tous les chantiers actifs."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un matériau"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MaterialStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvé</option>
              <option value="rejected">Rejeté</option>
            </select>
            <Button onClick={() => setModalState({ mode: 'create' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Ajouter un matériau
            </Button>
          </>
        }
      />

      {notice && (
        <div className="border-success/20 bg-success/10 text-success mb-4 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <SectionCard
        title="Inventory health"
        description="Monitor materials before they hit a shortage."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Matériaux
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {totalCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              En attente
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.status === 'pending').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Urgents
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.urgency === 'urgent').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Chantiers liés
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {new Set(filteredRows.map((row) => row.project_id).filter(Boolean)).size}
            </p>
          </Card>
        </div>
      </SectionCard>

      <SectionCard
        title="Purchase ledger"
        description="Searchable material rows with sortable columns."
      >
        {filteredRows.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="Aucun matériau ne correspond à vos filtres"
            description="Effacez la recherche ou ajustez le filtre de statut pour voir les lignes d’inventaire."
            actionLabel="Effacer les filtres"
            onAction={() => {
              setQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filteredRows}
            getRowId={(row) => row.id}
            selectable
            bulkActions={(selectedIds) => {
              const pendingSelectedIds = selectedIds.filter(
                (id) => rows.find((m) => m.id === id)?.status === 'pending',
              );
              if (pendingSelectedIds.length === 0) return null;
              return (
                <button
                  onClick={() => {
                    setBulkErrors([]);
                    setBulkConfirmIds(pendingSelectedIds);
                  }}
                  className="text-accent-700 text-sm font-semibold hover:underline"
                >
                  Approuver {pendingSelectedIds.length} demande(s)
                </button>
              );
            }}
          />
        )}
      </SectionCard>

      {/*
        FLAGGED FOR HAZEM — removed an "Alertes fournisseurs" section here
        that rendered three hardcoded fake strings ("Livraison de fer à
        béton dans 2 jours pour Coastal Villas", etc.) — not derived from
        any real data, and referencing project names that don't exist in
        this org. Unlike the fabricated stats flagged elsewhere (team/,
        vehicles/, projects/), this wasn't a placeholder number — it was
        specific, actionable-sounding operational text a contractor could
        genuinely act on ("stock is low, order more") that was entirely
        invented. Left out rather than shipped as if real.
      */}

      {modalState.mode !== 'closed' && (
        <MaterialFormModal
          material={modalState.mode === 'edit' ? modalState.material : undefined}
          projects={projectOptions}
          createMaterial={createMaterial}
          setMaterialCost={setMaterialCost}
          onSaved={() => router.refresh()}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}

      <ConfirmDialog
        open={bulkConfirmIds !== null}
        title="Approuver ces demandes ?"
        description={
          bulkConfirmIds
            ? [
                `Vous êtes sur le point d'approuver ${bulkConfirmIds.length} demande(s) :`,
                ...bulkConfirmIds.map((id) => {
                  const material = rows.find((m) => m.id === id);
                  return `• ${material?.item ?? '—'} (${formatQuantity(material?.quantity ?? null)})`;
                }),
                ...(bulkErrors.length > 0
                  ? ['', 'Échecs lors de la dernière tentative :', ...bulkErrors]
                  : []),
              ].join('\n')
            : ''
        }
        confirmLabel="Approuver"
        destructive={false}
        loading={bulkRunning}
        onConfirm={() => void handleBulkApprove()}
        onCancel={() => setBulkConfirmIds(null)}
      />

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === null
            ? ''
            : confirm.action === 'approve'
              ? `Approuver "${confirm.material.item}" ?`
              : `Supprimer ${confirm.material.item} ?`
        }
        description={
          confirm === null
            ? ''
            : confirm.action === 'approve'
              ? 'La demande sera validée et la dépense ajoutée au chantier.'
              : 'Le matériau sera retiré de l’inventaire. Cette action est définitive.'
        }
        confirmLabel={confirm?.action === 'approve' ? 'Approuver' : 'Supprimer'}
        destructive={confirm?.action !== 'approve'}
        loading={isPending}
        onConfirm={() => void handleConfirm()}
        onCancel={() => {
          setConfirm(null);
          setConfirmError(null);
        }}
      >
        {confirmError && (
          <p className="text-danger mt-2 text-sm">
            Impossible d’effectuer l’action : {confirmError}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

'use client';

import type { Material, MaterialStatus, MaterialUrgency, Project } from '@dala/shared-types';
import type { CreateMaterialInput, UpdateMaterialInput } from '@dala/validation';
import { PackageIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { deleteMaterial } from './actions';
import { MaterialFormModal } from './MaterialFormModal';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

type MaterialActionResult =
  { success: true; material: Material } | { success: false; error: string };

type CreateMaterialAction = (input: CreateMaterialInput) => Promise<MaterialActionResult>;
type UpdateMaterialAction = (input: UpdateMaterialInput) => Promise<MaterialActionResult>;
type DeleteMaterialAction = (input: { id: string }) => Promise<
  | {
      success: true;
      materialId: string;
    }
  | { success: false; error: string }
>;

type ModalState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; material: Material };

type MaterialRow = Material & {
  projectName: string;
  quantityLabel: string;
};

const STATUS_LABEL: Record<MaterialStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
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
  updateMaterial,
}: {
  materials: Material[];
  projects: Project[];
  createMaterial: CreateMaterialAction;
  updateMaterial: UpdateMaterialAction;
}) {
  const [rows, setRows] = useState(materials);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<MaterialStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setRows(materials);
  }, [materials]);

  const projectOptions = useMemo(() => {
    return projects.map((project) => ({ id: project.id, name: project.name }));
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
      header: 'Material',
      render: (row) => (
        <div>
          <div className="font-medium text-neutral-900">{row.item}</div>
          <div className="text-xs text-neutral-500">{row.note ?? 'No note'}</div>
        </div>
      ),
      sortValue: (row) => row.item,
    },
    {
      key: 'projectName',
      header: 'Project',
      render: (row) => row.projectName,
      sortValue: (row) => row.projectName,
    },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (row) => row.quantityLabel,
      sortValue: (row) => row.quantity ?? 0,
      align: 'right',
    },
    {
      key: 'urgency',
      header: 'Urgency',
      render: (row) => (
        <StatusBadge variant={URGENCY_VARIANT[row.urgency]}>
          {URGENCY_LABEL[row.urgency]}
        </StatusBadge>
      ),
      sortValue: (row) => row.urgency,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</StatusBadge>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (row) => new Date(row.created_at).toLocaleDateString('fr-TN'),
      sortValue: (row) => row.created_at,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setModalState({ mode: 'edit', material: row })}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Modify ${row.item}`}
          >
            <PencilSimpleIcon size={16} />
          </button>
          <button
            onClick={async () => {
              const confirmed = window.confirm(`Delete ${row.item}?`);
              if (!confirmed) return;
              const result = await deleteMaterial({ id: row.id });
              if (!result.success) {
                window.alert(result.error);
                return;
              }
              setRows((current) => current.filter((material) => material.id !== result.materialId));
              setNotice(`${row.item} removed from materials.`);
            }}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500"
            aria-label={`Delete ${row.item}`}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      ),
    },
  ];

  const totalCount = filteredRows.length;

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Materials"
        description="Track stock levels, suppliers, and purchase costs across all active projects."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search materials"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as MaterialStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <Button onClick={() => setModalState({ mode: 'create' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Add Material
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
              Materials
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {totalCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Pending
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.status === 'pending').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Urgent
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.urgency === 'urgent').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Projects linked
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
            title="No materials match your filters"
            description="Clear the search or adjust the status filter to see inventory rows."
            actionLabel="Clear filters"
            onAction={() => {
              setQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <DataTable columns={columns} rows={filteredRows} getRowId={(row) => row.id} />
        )}
      </SectionCard>

      <SectionCard title="Supplier alerts" description="Priority reminders for replenishment.">
        <div className="space-y-3">
          {[
            'Rebar delivery due in 2 days for Coastal Villas',
            'Cement stock below 25% on School Annex',
            'Paint order awaiting approval',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl px-4 py-3 text-sm text-neutral-900"
            >
              {item}
            </div>
          ))}
        </div>
      </SectionCard>

      {modalState.mode !== 'closed' && (
        <MaterialFormModal
          material={modalState.mode === 'edit' ? modalState.material : undefined}
          projects={projectOptions}
          createMaterial={createMaterial}
          updateMaterial={updateMaterial}
          onSaved={upsertMaterial}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </>
  );
}

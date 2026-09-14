'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterSelect,
  IconActionButton,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import { CarIcon, EyeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { deleteVehicle } from './actions';
import { VehicleFormModal } from './VehicleFormModal';

import { SectionCard, StatusMetric } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

const STATUS_LABEL: Record<VehicleStatus, string> = {
  available: 'Disponible',
  in_use: 'En service',
  maintenance: 'Maintenance',
};

const STATUS_VARIANT: Record<VehicleStatus, 'success' | 'info' | 'warning'> = {
  available: 'success',
  in_use: 'info',
  maintenance: 'warning',
};

type ModalState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; vehicle: Vehicle };

// FLAGGED FOR HAZEM (plan Step 12b): brand/model, driver/currentProject, and
// mileage are removed — no data source exists anywhere (§2.9 rule: no source
// → remove; vehicle_maintenance_log 0073 keeps only log_date/description/
// cost, no odometer). `fuelCost`/`maintenanceStatus` stay fabricated pending
// the open latest-entry-vs-date-range rendering decision (§7.1).
type VehicleRow = Vehicle & {
  fuelCost: number;
  maintenanceStatus: string;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString('fr-TN')} TND`;
}

export function VehiclesView({ vehicles }: { vehicles: Vehicle[] }) {
  const [rows, setRows] = useState(vehicles);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<VehicleRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModalState({ mode: 'create' });
    }
  }, [searchParams]);

  // FLAGGED FOR HAZEM (plan Step 12b) — resolved + still pending: brand,
  // model, driver, currentProject, mileage, and the unused derived
  // `availability` field are GONE (decisions 5 & 6 + §7.1: no source).
  // `fuelCost`/`maintenanceStatus` below remain fabricated from array index:
  // vehicle_maintenance_log (0073) is append-only history, and computing a
  // "current" value from it (latest log entry? sum over a date range?) is
  // the still-open product decision — same clearly-fake placeholder as
  // before until that call is made.
  const displayRows = useMemo<VehicleRow[]>(() => {
    return rows.map((vehicle, index) => ({
      ...vehicle,
      fuelCost: 180 + index * 35,
      maintenanceStatus:
        index % 3 === 0 ? 'Bientôt due' : index % 2 === 0 ? 'État sain' : 'Inspection en attente',
    }));
  }, [rows]);

  // §2.7 global search — clicking a "vehicle" result in the top-bar
  // dropdown deep-links to the vehicle's detail page (§2.9), same as
  // projects/workers.
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;
    if (displayRows.some((v) => v.id === highlightId)) {
      router.push(`/vehicles/${highlightId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, displayRows]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.name, row.plate ?? ''].some((value) => value.toLowerCase().includes(lower));
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, query, statusFilter]);

  async function handleDeleteVehicle() {
    if (deleteTarget === null) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteVehicle(target.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== target.id));
      setNotice(`${target.name} a été retiré du parc.`);
      setDeleteTarget(null);
    });
  }

  const columns: DataTableColumn<VehicleRow>[] = [
    {
      key: 'name',
      header: 'Véhicule',
      render: (v) => <div className="font-medium text-neutral-900">{v.name}</div>,
      sortValue: (v) => v.name,
    },
    {
      key: 'plate',
      header: 'Immatriculation',
      render: (v) => v.plate ?? '—',
      sortValue: (v) => v.plate ?? '',
    },
    {
      key: 'capacity',
      header: 'Capacité',
      render: (v) => `${v.capacity} ouvriers`,
      sortValue: (v) => v.capacity,
      align: 'right',
    },
    {
      key: 'fuelCost',
      header: 'Coût carburant',
      render: (v) => formatMoney(v.fuelCost),
      sortValue: (v) => v.fuelCost,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Disponibilité',
      render: (v) => (
        <StatusBadge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</StatusBadge>
      ),
      sortValue: (v) => v.status,
    },
    {
      key: 'maintenanceStatus',
      header: 'État de maintenance',
      render: (v) => v.maintenanceStatus,
      sortValue: (v) => v.maintenanceStatus,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (v) => (
        <div className="flex items-center justify-end gap-1.5">
          <IconActionButton
            icon={EyeIcon}
            label={`Voir le détail de ${v.name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/vehicles/${v.id}`);
            }}
          />
          <IconActionButton
            icon={PencilSimpleIcon}
            label={`Modifier ${v.name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', vehicle: v });
            }}
          />
          <IconActionButton
            icon={TrashIcon}
            label={`Supprimer ${v.name}`}
            tone="danger"
            size="sm"
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteError(null);
              setDeleteTarget(v);
            }}
          />
        </div>
      ),
    },
  ];

  const availableCount = filteredRows.filter((vehicle) => vehicle.status === 'available').length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <PageHero
        eyebrow="Flotte"
        title="Véhicules"
        description="Suivez les véhicules, les affectations, la maintenance et la disponibilité dans une seule vue."
        actions={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Ajouter un véhicule
          </Button>
        }
      />

      <SectionCard
        title="Liste des véhicules"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Rechercher un véhicule" />
            <FilterSelect
              aria-label="Filtrer par statut"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | 'all')}
              options={[
                { value: 'all', label: 'Tous les statuts' },
                { value: 'available', label: 'Disponible' },
                { value: 'in_use', label: 'En service' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
            />
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Taille du parc
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.length}
            </p>
          </Card>
          <StatusMetric label="Disponibles" count={availableCount} variant="success" />
          <StatusMetric
            label="Affectés"
            count={filteredRows.filter((vehicle) => vehicle.status === 'in_use').length}
            variant="info"
          />
          <StatusMetric
            label="À réviser"
            count={filteredRows.filter((vehicle) => vehicle.status === 'maintenance').length}
            variant="warning"
          />
        </div>

        <div className="mt-5">
          {filteredRows.length === 0 ? (
            <EmptyState
              icon={CarIcon}
              title="Aucun véhicule ne correspond à vos filtres"
              description="Effacez la recherche ou changez de statut pour voir les véhicules du parc."
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
              getRowId={(v) => v.id}
              onRowClick={(v) => router.push(`/vehicles/${v.id}`)}
            />
          )}
        </div>
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Supprimer ${deleteTarget.name} ?` : ''}
        description={
          deleteTarget ? `Le véhicule « ${deleteTarget.name} » sera retiré du parc.` : ''
        }
        confirmLabel="Supprimer"
        destructive
        loading={isPending}
        onConfirm={() => void handleDeleteVehicle()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      >
        {deleteError && (
          <p className="text-danger mt-2 text-sm">
            Impossible de supprimer le véhicule : {deleteError}
          </p>
        )}
      </ConfirmDialog>

      {modalState.mode !== 'closed' && (
        <VehicleFormModal
          vehicle={modalState.mode === 'edit' ? modalState.vehicle : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </div>
  );
}

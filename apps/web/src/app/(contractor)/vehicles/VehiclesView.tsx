'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterSelect,
  IconActionButton,
  IconStatCard,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import {
  CarIcon,
  CheckCircleIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { deleteVehicle } from './actions';
import { VehicleFormModal } from './VehicleFormModal';

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

type VehicleRow = Vehicle & { signed_photo_url?: string | null };

export function VehiclesView({
  vehicles,
}: {
  vehicles: (Vehicle & { signed_photo_url?: string | null })[];
}) {
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

  // Web shell field-coverage pass — the previous `displayRows` memo bolted
  // on `fuelCost`/`maintenanceStatus`, fabricated from each row's array
  // index (180 + index * 35, a literal index % 3 lookup table). No column
  // backs either one — vehicle_maintenance_log (0073) is append-only
  // history and computing a "current" value from it is a real, still-open
  // product decision (what does "current" mean: latest entry? a date
  // range?). Decision made: drop both columns entirely rather than keep
  // showing fabricated numbers while that decision is pending — the
  // detail page already made the same call (shows "—" there instead of
  // inventing a number). `displayRows` collapses to `rows` directly; kept
  // as its own binding so the highlight/filter effects below don't need
  // touching.
  const displayRows = rows;

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

  // Plan Step 13 — pagination, admin's shape (OrganizationsTable et al.,
  // PAGE_SIZE = 50 there too): DataTable only renders the controls; the
  // caller slices rows to the current page. Back to page 1 whenever a filter
  // input changes, and clamp the rendered page so deleting the last row of
  // the last page can't strand an empty view.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

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
      render: (v) => (
        <div className="flex items-center gap-2.5">
          {v.signed_photo_url ? (
            <img
              src={v.signed_photo_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="rounded-lg bg-accent-50 text-accent-700 flex h-12 w-12 shrink-0 items-center justify-center text-sm font-semibold">
              {v.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="font-medium text-neutral-900">{v.name}</div>
        </div>
      ),
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
      key: 'status',
      header: 'Disponibilité',
      render: (v) => (
        <StatusBadge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</StatusBadge>
      ),
      sortValue: (v) => v.status,
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
        icon={CarIcon}
        title="Véhicules"
        description="Suivez les véhicules, les affectations, la maintenance et la disponibilité dans une seule vue."
        actions={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Ajouter un véhicule
          </Button>
        }
      />

      <FilterBar>
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
      </FilterBar>

      <SectionCard title="Liste des véhicules">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <IconStatCard
            icon={CarIcon}
            tone="accent"
            label="Taille du parc"
            value={filteredRows.length}
          />
          <IconStatCard icon={CheckCircleIcon} tone="success" label="Disponibles" value={availableCount} />
          <IconStatCard
            icon={TruckIcon}
            tone="categoricalBlue"
            label="Affectés"
            value={filteredRows.filter((vehicle) => vehicle.status === 'in_use').length}
          />
          <IconStatCard
            icon={WrenchIcon}
            tone="warning"
            label="À réviser"
            value={filteredRows.filter((vehicle) => vehicle.status === 'maintenance').length}
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
              rows={pagedRows}
              getRowId={(v) => v.id}
              onRowClick={(v) => router.push(`/vehicles/${v.id}`)}
              pagination={{
                page: currentPage,
                pageSize: PAGE_SIZE,
                total: filteredRows.length,
                onPageChange: setPage,
              }}
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

'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import {
  AvatarStack,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import { CarIcon, EyeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { deleteVehicle } from './actions';
import { VehicleFormModal } from './VehicleFormModal';

import { ProgressBar, SectionCard, StatusMetric } from '@/components/contractor/Screen';
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
type DetailState = { mode: 'none' } | { mode: 'vehicle'; vehicle: VehicleRow };

type VehicleRow = Vehicle & {
  brand: string;
  model: string;
  driver: string;
  currentProject: string;
  mileage: number;
  fuelCost: number;
  maintenanceStatus: string;
  availability: string;
};

function formatMoney(value: number): string {
  return `${value.toLocaleString('fr-TN')} TND`;
}

export function VehiclesView({ vehicles }: { vehicles: Vehicle[] }) {
  const [rows, setRows] = useState(vehicles);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [detailState, setDetailState] = useState<DetailState>({ mode: 'none' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModalState({ mode: 'create' });
    }
  }, [searchParams]);

  // FLAGGED FOR HAZEM — same pattern as team/'s roster stats: brand, model,
  // driver, currentProject, mileage, fuelCost, and maintenanceStatus below
  // are fabricated from array index, not real data. driver/currentProject
  // would need a dispatch_assignments join; mileage/fuelCost/maintenance
  // status would need vehicle_maintenance_log (0073), which is append-only
  // history, not a running odometer/cost total — computing those "current
  // value" numbers from it is itself a product decision (latest log entry?
  // sum of a date range?) rather than a one-line fix. Left as clearly-fake
  // placeholder data pending that decision, same as team/.
  const displayRows = useMemo<VehicleRow[]>(() => {
    return rows.map((vehicle, index) => ({
      ...vehicle,
      brand: ['Toyota', 'Renault', 'Ford', 'Isuzu'][index % 4]!,
      model: ['Hilux', 'Master', 'Transit', 'NPR'][index % 4]!,
      driver: ['Sami', 'Nour', 'Rami', 'Meriem'][index % 4]!,
      currentProject: ['El Baraka Towers', 'Villa Sfax', 'Rénovation du port', 'Annexe scolaire'][
        index % 4
      ]!,
      mileage: 32000 + index * 4200,
      fuelCost: 180 + index * 35,
      maintenanceStatus:
        index % 3 === 0 ? 'Bientôt due' : index % 2 === 0 ? 'État sain' : 'Inspection en attente',
      availability:
        vehicle.status === 'available'
          ? 'Prêt'
          : vehicle.status === 'in_use'
            ? 'Affecté'
            : 'Hors ligne',
    }));
  }, [rows]);

  // §2.7 global search — clicking a "vehicle" result in the top-bar
  // dropdown deep-links here as ?highlight=<id>.
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;
    const match = displayRows.find((v) => v.id === highlightId);
    if (match) setDetailState({ mode: 'vehicle', vehicle: match });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, displayRows]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.name, row.plate ?? '', row.brand, row.model, row.driver, row.currentProject].some(
          (value) => value.toLowerCase().includes(lower),
        );
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, query, statusFilter]);

  const selectedVehicle = detailState.mode === 'vehicle' ? detailState.vehicle : null;

  const columns: DataTableColumn<VehicleRow>[] = [
    {
      key: 'name',
      header: 'Véhicule',
      render: (v) => (
        <div>
          <div className="font-medium text-neutral-900">{v.name}</div>
          <div className="text-xs text-neutral-500">
            {v.brand} {v.model}
          </div>
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
      key: 'driver',
      header: 'Conducteur actuel',
      render: (v) => v.driver,
      sortValue: (v) => v.driver,
    },
    {
      key: 'currentProject',
      header: 'Chantier actuel',
      render: (v) => v.currentProject,
      sortValue: (v) => v.currentProject,
    },
    {
      key: 'capacity',
      header: 'Capacité',
      render: (v) => `${v.capacity} ouvriers`,
      sortValue: (v) => v.capacity,
      align: 'right',
    },
    {
      key: 'mileage',
      header: 'Kilométrage',
      render: (v) => `${v.mileage.toLocaleString('fr-TN')} km`,
      sortValue: (v) => v.mileage,
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailState({ mode: 'vehicle', vehicle: v });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Voir le détail de ${v.name}`}
          >
            <EyeIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', vehicle: v });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Modify ${v.name}`}
          >
            <PencilSimpleIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const confirmed = window.confirm(`Supprimer ${v.name} ?`);
              if (!confirmed) return;
              startTransition(async () => {
                const result = await deleteVehicle(v.id);
                if (!result.success) {
                  window.alert(result.error);
                  return;
                }
                setRows((current) => current.filter((row) => row.id !== v.id));
                setNotice(`${v.name} a été retiré du parc.`);
              });
            }}
            disabled={isPending}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500 disabled:opacity-50"
            aria-label={`Supprimer ${v.name}`}
          >
            <TrashIcon size={16} />
          </button>
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
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un véhicule"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="available">Disponible</option>
              <option value="in_use">En service</option>
              <option value="maintenance">Maintenance</option>
            </select>
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
              onRowClick={(v) => setDetailState({ mode: 'vehicle', vehicle: v })}
            />
          )}
        </div>
      </SectionCard>

      {selectedVehicle && (
        <Card raised className="mt-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                Vue du véhicule
              </p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-neutral-900">
                {selectedVehicle.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedVehicle.brand} {selectedVehicle.model} ·{' '}
                {selectedVehicle.plate ?? 'Aucune immatriculation'}
              </p>
            </div>
            <StatusBadge variant={STATUS_VARIANT[selectedVehicle.status]}>
              {STATUS_LABEL[selectedVehicle.status]}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Driver</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedVehicle.driver}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Chantier actuel</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedVehicle.currentProject}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Coût carburant</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {formatMoney(selectedVehicle.fuelCost)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Maintenance</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedVehicle.maintenanceStatus}
              </p>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Kilométrage</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedVehicle.mileage.toLocaleString('fr-TN')} km
              </p>
              <div className="mt-3">
                <ProgressBar
                  value={Math.min(100, Math.round(selectedVehicle.mileage / 600))}
                  tone="accent"
                />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Capacité d’équipage</p>
              <div className="mt-3">
                <AvatarStack
                  people={[{ name: 'Youssef' }, { name: 'Aymen' }, { name: 'Meriem' }]}
                />
              </div>
            </Card>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setModalState({ mode: 'edit', vehicle: selectedVehicle })}
            >
              <PencilSimpleIcon size={16} className="me-1.5 inline" />
              Modifier le véhicule
            </Button>
            <Button variant="secondary" onClick={() => setDetailState({ mode: 'none' })}>
              Fermer le détail
            </Button>
          </div>
        </Card>
      )}

      {modalState.mode !== 'closed' && (
        <VehicleFormModal
          vehicle={modalState.mode === 'edit' ? modalState.vehicle : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </div>
  );
}

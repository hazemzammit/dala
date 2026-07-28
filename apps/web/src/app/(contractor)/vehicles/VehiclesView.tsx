'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import { CarIcon, EyeIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { VehicleFormModal } from './VehicleFormModal';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

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
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModalState({ mode: 'create' });
    }
  }, [searchParams]);

  const displayRows = useMemo<VehicleRow[]>(() => {
    return rows.map((vehicle, index) => ({
      ...vehicle,
      brand: ['Toyota', 'Renault', 'Ford', 'Isuzu'][index % 4]!,
      model: ['Hilux', 'Master', 'Transit', 'NPR'][index % 4]!,
      driver: ['Sami', 'Nour', 'Rami', 'Meriem'][index % 4]!,
      currentProject: ['El Baraka Towers', 'Villa Sfax', 'Port Renovation', 'School Annex'][
        index % 4
      ]!,
      mileage: 32000 + index * 4200,
      fuelCost: 180 + index * 35,
      maintenanceStatus:
        index % 3 === 0 ? 'Due soon' : index % 2 === 0 ? 'Healthy' : 'Inspection pending',
      availability:
        vehicle.status === 'available'
          ? 'Ready'
          : vehicle.status === 'in_use'
            ? 'Assigned'
            : 'Offline',
    }));
  }, [rows]);

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
      header: 'Vehicle',
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
      header: 'Registration',
      render: (v) => v.plate ?? '—',
      sortValue: (v) => v.plate ?? '',
    },
    {
      key: 'driver',
      header: 'Current Driver',
      render: (v) => v.driver,
      sortValue: (v) => v.driver,
    },
    {
      key: 'currentProject',
      header: 'Current Project',
      render: (v) => v.currentProject,
      sortValue: (v) => v.currentProject,
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (v) => `${v.capacity} workers`,
      sortValue: (v) => v.capacity,
      align: 'right',
    },
    {
      key: 'mileage',
      header: 'Mileage',
      render: (v) => `${v.mileage.toLocaleString('fr-TN')} km`,
      sortValue: (v) => v.mileage,
      align: 'right',
    },
    {
      key: 'fuelCost',
      header: 'Fuel Cost',
      render: (v) => formatMoney(v.fuelCost),
      sortValue: (v) => v.fuelCost,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Availability',
      render: (v) => (
        <StatusBadge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</StatusBadge>
      ),
      sortValue: (v) => v.status,
    },
    {
      key: 'maintenanceStatus',
      header: 'Maintenance Status',
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
            aria-label={`View details for ${v.name}`}
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
              const confirmed = window.confirm(`Delete ${v.name}?`);
              if (!confirmed) return;
              setRows((current) => current.filter((row) => row.id !== v.id));
              setNotice(`${v.name} removed from the fleet.`);
            }}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500"
            aria-label={`Delete ${v.name}`}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      ),
    },
  ];

  const availableCount = filteredRows.filter((vehicle) => vehicle.status === 'available').length;

  return (
    <>
      {notice && (
        <div className="border-success/20 bg-success/10 text-success mb-4 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <SectionCard
        title="Fleet management"
        description="Track vehicles, assignments, maintenance, and availability in one view."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vehicles"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as VehicleStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="in_use">In use</option>
              <option value="maintenance">Maintenance</option>
            </select>
            <Button onClick={() => setModalState({ mode: 'create' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Add Vehicle
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Fleet size
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Available
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {availableCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Assigned
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((vehicle) => vehicle.status === 'in_use').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Needs service
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((vehicle) => vehicle.status === 'maintenance').length}
            </p>
          </Card>
        </div>

        <div className="mt-5">
          {filteredRows.length === 0 ? (
            <EmptyState
              icon={CarIcon}
              title="No vehicles match your filters"
              description="Clear the search or switch status filters to see fleet records."
              actionLabel="Clear filters"
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
                Vehicle overview
              </p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-neutral-900">
                {selectedVehicle.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedVehicle.brand} {selectedVehicle.model} ·{' '}
                {selectedVehicle.plate ?? 'No registration'}
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
              <p className="text-xs text-neutral-500">Current project</p>
              <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
                {selectedVehicle.currentProject}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Fuel cost</p>
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
              <p className="text-xs text-neutral-500">Mileage</p>
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
              <p className="text-xs text-neutral-500">Crew capacity</p>
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
              Edit vehicle
            </Button>
            <Button variant="secondary" onClick={() => setDetailState({ mode: 'none' })}>
              Close details
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
    </>
  );
}

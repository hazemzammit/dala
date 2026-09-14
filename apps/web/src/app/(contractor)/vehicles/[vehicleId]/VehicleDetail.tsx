'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import { Button, Card, DetailHeader, StatusBadge } from '@dala/ui-web';
import { CarIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { VehicleFormModal } from '../VehicleFormModal';

/**
 * Vehicle detail (web consistency plan §2.9). Only REAL columns of the
 * `vehicles` table are rendered (name, plate, capacity, status, created_at)
 * — the inline card's fabricated fields (brand/model/driver/currentProject/
 * mileage/fuelCost/maintenanceStatus) are NOT carried over, consistent with
 * the ProjectDetail/WorkerDetail precedent that brand-new pages must not
 * ship fabricated stats.
 *
 * FLAGGED FOR HAZEM (plan Step 12b / §2.9): maintenance economics have a
 * real source — `vehicle_maintenance_log` (migration 0073: log_date,
 * description, cost) — but it is append-only history, not a running odometer
 * or cost total. Deciding the rendering (latest entry vs. date-range sum) is
 * a product decision, so the two cards below stay at '—' until Step 12b.
 */

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

export function VehicleDetail({ vehicle }: { vehicle: Vehicle }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <DetailHeader
        backHref="/vehicles"
        backLabel="Véhicules"
        icon={CarIcon}
        title={vehicle.name}
        status={
          <StatusBadge variant={STATUS_VARIANT[vehicle.status]}>
            {STATUS_LABEL[vehicle.status]}
          </StatusBadge>
        }
        meta={[
          { label: 'Immatriculation', value: vehicle.plate ?? 'Non renseignée' },
          { label: 'Capacité', value: `${vehicle.capacity} ouvriers` },
        ]}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon size={16} className="me-1.5 inline" />
            Modifier le véhicule
          </Button>
        }
      />

      <Card raised className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
          Maintenance
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            {/* FLAGGED FOR HAZEM (Step 12b) — source: latest
                vehicle_maintenance_log.cost (0073). */}
            <p className="text-xs text-neutral-500">Coût carburant / dernier relevé</p>
            <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">—</p>
          </Card>
          <Card className="p-4">
            {/* FLAGGED FOR HAZEM (Step 12b) — source: latest
                vehicle_maintenance_log.description (0073). */}
            <p className="text-xs text-neutral-500">Dernière intervention</p>
            <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">—</p>
          </Card>
        </div>
      </Card>

      {editOpen && <VehicleFormModal vehicle={vehicle} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

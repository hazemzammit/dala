'use client';

import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import { XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { createVehicle, updateVehicle } from './actions';


const STATUS_OPTIONS: { value: VehicleStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'in_use', label: 'En service' },
  { value: 'maintenance', label: 'Maintenance' },
];

export function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const isEdit = !!vehicle;
  const [name, setName] = useState(vehicle?.name ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [capacity, setCapacity] = useState(vehicle?.capacity?.toString() ?? '');
  const [status, setStatus] = useState<VehicleStatus>(vehicle?.status ?? 'available');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedCapacity = Number(capacity);
    if (!name.trim() || !Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      setError('Vérifiez le nom et la capacité (nombre entier positif).');
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateVehicle({
            id: vehicle.id,
            name,
            plate: plate || undefined,
            capacity: parsedCapacity,
            status,
            version: vehicle.version,
          })
        : await createVehicle({
            name,
            plate: plate || undefined,
            capacity: parsedCapacity,
            status,
          });

      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEdit ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Nom du véhicule"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Camionnette Renault"
            required
          />
          <FormField
            label="Immatriculation"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Ex. 123 TUN 4567"
          />
          <FormField
            label="Capacité (ouvriers)"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Statut</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as VehicleStatus)}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

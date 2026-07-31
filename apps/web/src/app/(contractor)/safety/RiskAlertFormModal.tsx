'use client';

import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { createRiskAlert } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


export function RiskAlertFormModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('low');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 2) {
      setError('Description requise.');
      return;
    }

    startTransition(async () => {
      const result = await createRiskAlert({ description, severity });
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
            Signaler un risque
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
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez le risque identifié"
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Niveau de risque</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as 'low' | 'medium' | 'high')}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              <option value="low">Faible</option>
              <option value="medium">Moyen</option>
              <option value="high">Élevé</option>
            </select>
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

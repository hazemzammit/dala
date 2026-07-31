'use client';

import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { createPpeChecklist } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


export function PpeChecklistFormModal({ onClose }: { onClose: () => void }) {
  const [item, setItem] = useState('');
  const [compliant, setCompliant] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (item.trim().length < 2) {
      setError('Élément requis.');
      return;
    }

    startTransition(async () => {
      const result = await createPpeChecklist({ item, compliant });
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
            Ajouter une vérification
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
            label="Élément vérifié"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Ex. Casques de chantier"
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Statut</label>
            <select
              value={compliant ? 'yes' : 'no'}
              onChange={(e) => setCompliant(e.target.value === 'yes')}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              <option value="yes">Conforme</option>
              <option value="no">Non conforme</option>
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

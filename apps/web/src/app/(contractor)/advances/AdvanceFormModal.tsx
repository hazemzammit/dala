'use client';

import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { createAdvance } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


type Worker = { id: string; full_name: string };

export function AdvanceFormModal({ workers, onClose }: { workers: Worker[]; onClose: () => void }) {
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Montant invalide.');
      return;
    }

    // Doc 01 §1.11 — clé générée au moment du clic, avant l'envoi.
    const idempotencyKey = crypto.randomUUID();

    startTransition(async () => {
      const result = await createAdvance({
        worker_id: workerId,
        amount: parsedAmount,
        reason: reason || undefined,
        idempotency_key: idempotencyKey,
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
          <h2 className="font-display text-lg font-semibold text-neutral-900">Nouvelle avance</h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Ouvrier</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.full_name}
                </option>
              ))}
            </select>
          </div>

          <FormField
            label="Montant (TND)"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex. 100"
            required
          />

          <FormField
            label="Motif (optionnel)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. Avance pour dépenses familiales"
          />

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

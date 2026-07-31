'use client';

import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition } from 'react';

import { createOrgInsurance } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


export function InsuranceFormModal({ onClose }: { onClose: () => void }) {
  const [providerName, setProviderName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (providerName.trim().length < 2) {
      setError('Fournisseur requis.');
      return;
    }

    startTransition(async () => {
      const result = await createOrgInsurance({
        provider_name: providerName,
        policy_number: policyNumber || undefined,
        expires_at: expiresAt || undefined,
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
            Ajouter une assurance
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
            label="Fournisseur"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="Ex. STAR Assurances"
            required
          />
          <FormField
            label="Numéro de police (optionnel)"
            value={policyNumber}
            onChange={(e) => setPolicyNumber(e.target.value)}
          />
          <FormField
            label="Date d'expiration (optionnel)"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
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

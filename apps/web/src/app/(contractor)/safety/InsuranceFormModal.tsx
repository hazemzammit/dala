'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { XIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';

import { createOrgInsurance } from './actions';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

// Mirrors apps/mobile/src/lib/pickerOptions.ts's INSURANCE_COVERAGE_OPTIONS.
const COVERAGE_OPTIONS = [
  'Responsabilité civile',
  'Décennale',
  'Multirisque chantier',
  'Flotte automobile',
];

export function InsuranceFormModal({ onClose }: { onClose: () => void }) {
  const [providerName, setProviderName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [coverageType, setCoverageType] = useState(COVERAGE_OPTIONS[0]!);
  const [expiresAt, setExpiresAt] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (providerName.trim().length < 2) {
      setError('Fournisseur requis.');
      return;
    }
    // createOrgInsuranceSchema requires expires_at (not optional, unlike
    // the collaborator's original version of this form) — 0020's own
    // comment on reminder_enabled explains why: the whole point of the
    // insurance tracker is an expiry-reminder, which needs a real date.
    if (!expiresAt) {
      setError("Date d'expiration requise.");
      return;
    }

    startTransition(async () => {
      const result = await createOrgInsurance({
        provider_name: providerName,
        policy_number: policyNumber || undefined,
        coverage_type: coverageType,
        expires_at: expiresAt,
        reminder_enabled: reminderEnabled,
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Type de couverture</label>
            <select
              value={coverageType}
              onChange={(e) => setCoverageType(e.target.value)}
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {COVERAGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <FormField
            label="Date d'expiration"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            required
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
            />
            Me rappeler avant l’expiration
          </label>

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

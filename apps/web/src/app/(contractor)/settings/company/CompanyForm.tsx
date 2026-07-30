'use client';

import { useState, useTransition } from 'react';

import { updateOrganization } from './actions';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';


type Organization = {
  name: string;
  trade_type: string | null;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
} | null;

export function CompanyForm({ organization }: { organization: Organization }) {
  const [name, setName] = useState(organization?.name ?? '');
  const [tradeType, setTradeType] = useState(organization?.trade_type ?? '');
  const [address, setAddress] = useState(organization?.address ?? '');
  const [contactPhone, setContactPhone] = useState(organization?.contact_phone ?? '');
  const [contactEmail, setContactEmail] = useState(organization?.contact_email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (name.trim().length < 2) {
      setError("Le nom de l'entreprise doit contenir au moins 2 caractères.");
      return;
    }

    startTransition(async () => {
      const result = await updateOrganization({
        name,
        trade_type: tradeType || undefined,
        address: address || undefined,
        contact_phone: contactPhone || undefined,
        contact_email: contactEmail || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="max-w-xl p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Nom de l'entreprise"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <FormField
          label="Corps de métier"
          value={tradeType}
          onChange={(e) => setTradeType(e.target.value)}
          placeholder="Ex. Plomberie"
        />
        <FormField label="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
        <FormField
          label="Téléphone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
        <FormField
          label="E-mail de contact"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />

        {error && <p className="text-danger text-sm">{error}</p>}
        {saved && <p className="text-success text-sm">Modifications enregistrées.</p>}

        <div className="mt-2 flex justify-end">
          <Button type="submit" loading={isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Card>
  );
}

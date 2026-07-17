'use client';

import { createOrganizationSchema } from '@dala/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.13 — "Create organization" flow for an already-authenticated
 * user with no active org (or adding an additional one). Uses
 * create_organization_for_current_user() (migration 0014) — the
 * security-definer RPC that exists specifically because a plain client
 * insert can't create the first organization_members row under RLS. See
 * that migration's header comment for the full explanation.
 */
export default function CreateOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createOrganizationSchema.safeParse({ name, trade_type: tradeType || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('create_organization_for_current_user', {
      p_name: parsed.data.name,
      p_trade_type: parsed.data.trade_type ?? null,
    });
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Créer une entreprise
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Vous en serez le propriétaire (owner).</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <FormField
            label="Nom de l'entreprise"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <FormField
            label="Type d'activité (optionnel)"
            value={tradeType}
            onChange={(e) => setTradeType(e.target.value)}
            placeholder="Plomberie, électricité…"
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            Créer l&apos;entreprise
          </Button>
        </form>
      </Card>
    </main>
  );
}

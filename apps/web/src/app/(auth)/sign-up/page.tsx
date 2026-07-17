'use client';

import { signUpSchema } from '@dala/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.3 — contractor sign-up. Calls the `sign-up` Edge Function
 * (supabase/functions/sign-up) rather than `supabase.auth.signUp()`
 * directly, because the org + owner-membership creation can't happen
 * client-side under RLS before email confirmation (see the function's own
 * header comment, and migration 0014's header comment, for why).
 *
 * Doc 05 §2.5 — single-column form, 16px vertical rhythm, label-above
 * fields, full-width bottom-anchored primary CTA, secondary actions below
 * it in neutral-500.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    organization_name: '',
    trade_type: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: fnError } = await supabase.functions.invoke('sign-up', {
      body: parsed.data,
    });
    setLoading(false);

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Impossible de créer le compte.');
      return;
    }

    router.push('/check-email');
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Créer votre compte
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pour votre entreprise — chaque membre de l&apos;équipe rejoint ensuite par invitation.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <FormField
            label="Nom complet"
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
            required
          />

          <FormField
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
          />

          <FormField
            label="Téléphone"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            required
          />

          <div>
            <FormField
              label="Mot de passe"
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              required
              minLength={10}
            />
            <PasswordStrengthMeter password={form.password} />
          </div>

          <FormField
            label="Nom de l'entreprise"
            value={form.organization_name}
            onChange={(e) => update('organization_name', e.target.value)}
            required
          />

          <FormField
            label="Type d'activité (optionnel)"
            value={form.trade_type}
            onChange={(e) => update('trade_type', e.target.value)}
            placeholder="Plomberie, électricité…"
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            Créer mon compte
          </Button>
        </form>
      </Card>
    </main>
  );
}

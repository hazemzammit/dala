'use client';

import { signUpSchema } from '@dala/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';


import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.3 — contractor sign-up. Calls the `sign-up` Edge Function
 * (supabase/functions/sign-up) rather than `supabase.auth.signUp()`
 * directly, because the org + owner-membership creation can't happen
 * client-side under RLS before email confirmation (see the function's own
 * header comment, and migration 0014's header comment, for why).
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
      <form
        onSubmit={handleSubmit}
        className="rounded-card bg-neutral-0 w-full max-w-sm border border-neutral-100 p-8 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]"
      >
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Créer votre compte
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pour votre entreprise — chaque membre de l'équipe rejoint ensuite par invitation.
        </p>

        <Field label="Nom complet">
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
          />
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
          />
        </Field>

        <Field label="Téléphone">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
          />
        </Field>

        <Field label="Mot de passe">
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
            minLength={10}
          />
          {/* Doc 01 §1.3.6: strength meter (zxcvbn) goes here — plain-language
              feedback, not a pass/fail wall. Not wired up in this scaffold yet. */}
        </Field>

        <Field label="Nom de l'entreprise">
          <input
            type="text"
            value={form.organization_name}
            onChange={(e) => update('organization_name', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
          />
        </Field>

        <Field label="Type d'activité (optionnel)">
          <input
            type="text"
            value={form.trade_type}
            onChange={(e) => update('trade_type', e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            placeholder="Plomberie, électricité…"
          />
        </Field>

        {error && <p className="text-danger mt-3 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-control bg-accent-600 mt-6 w-full py-2.5 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-4 block text-sm font-medium text-neutral-900">
      {label}
      {children}
    </label>
  );
}

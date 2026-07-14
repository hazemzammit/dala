'use client';

import { forgotPasswordSchema } from '@dala/validation';
import { useState } from 'react';


import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.7 — always shows the same confirmation regardless of whether
 * the account exists (step 2). The `forgot-password` Edge Function already
 * enforces this; this screen just displays whatever it returns without
 * branching on success/failure.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Adresse e-mail invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.functions.invoke('forgot-password', {
      body: parsed.data,
    });
    setLoading(false);

    // Deliberately shown regardless of what happened server-side — see
    // the Edge Function's GENERIC_RESPONSE constant, which this mirrors.
    setMessage(
      data?.message ??
        'Si un compte existe pour cet e-mail, nous avons envoyé un lien de réinitialisation.',
    );
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-card bg-neutral-0 w-full max-w-sm border border-neutral-100 p-8 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]"
      >
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Mot de passe oublié
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entrez votre e-mail, nous vous enverrons un lien de réinitialisation.
        </p>

        <label className="mt-6 block text-sm font-medium text-neutral-900">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
          />
        </label>

        {error && <p className="text-danger mt-3 text-sm">{error}</p>}
        {message && <p className="text-success mt-3 text-sm">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-control bg-accent-600 mt-6 w-full py-2.5 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Envoi…' : 'Envoyer le lien'}
        </button>
      </form>
    </main>
  );
}

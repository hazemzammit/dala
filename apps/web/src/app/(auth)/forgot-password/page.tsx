'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { forgotPasswordSchema } from '@dala/validation';
import Image from 'next/image';
import { useState } from 'react';

import logo from '../../../../assets/logo.png';

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
    <main className="bg-neutral-25 relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="bg-accent-100/40 pointer-events-none absolute -end-24 -top-24 h-[360px] w-[360px] rounded-full blur-3xl" />
      <Card className="relative z-10 w-full max-w-sm p-8">
        <Image src={logo} alt="Dala" className="mb-6 h-10 w-auto" priority />
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Mot de passe oublié
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entrez votre e-mail, nous vous enverrons un lien de réinitialisation.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <FormField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {error && <p className="text-danger text-sm">{error}</p>}
          {message && <p className="text-success text-sm">{message}</p>}

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            Envoyer le lien
          </Button>

          <a href="/login" className="hover:text-accent-600 text-center text-sm text-neutral-500">
            Retour à la connexion
          </a>
        </form>
      </Card>
    </main>
  );
}

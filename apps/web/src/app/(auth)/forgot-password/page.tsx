'use client';

import { Button, Card, FormField } from '@dala/ui-web';
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
      <Card className="w-full max-w-sm p-8">
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
        </form>
      </Card>
    </main>
  );
}

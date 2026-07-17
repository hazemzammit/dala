'use client';


import { loginSchema } from '@dala/validation';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { createClient } from '@/lib/supabase/client';

/**
 * Doc 04 §4.1.3 — Log In (web). TODO before shipping: surface the
 * 5-failed-attempts lockout messaging (Doc 01 §1.3.8) — not wired up yet.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    window.location.href = '/dashboard';
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">Se connecter</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <FormField
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <FormField
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            Se connecter
          </Button>

          <div className="flex items-center justify-between text-sm">
            <a href="/forgot-password" className="hover:text-accent-600 text-neutral-500">
              Mot de passe oublié ?
            </a>
            <a href="/sign-up" className="hover:text-accent-600 text-neutral-500">
              Créer un compte
            </a>
          </div>
        </form>
      </Card>
    </main>
  );
}

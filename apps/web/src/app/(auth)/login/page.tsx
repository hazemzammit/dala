'use client';

import { useState } from 'react';

import { loginSchema } from '@dala/validation';

import { createClient } from '@/lib/supabase/client';

/**
 * Doc 04 §4.1.3 — Log In (web). This is a starting skeleton: wire up
 * routing to /dashboard on success, surface the 5-failed-attempts lockout
 * messaging (Doc 01 §1.3.8), and add the "show password" toggle before
 * calling this screen done.
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
    <main className="flex min-h-screen items-center justify-center bg-neutral-25 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-card border border-neutral-100 bg-neutral-0 p-8 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]"
      >
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">Se connecter</h1>

        <label className="mt-6 block text-sm font-medium text-neutral-900">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-control border border-neutral-300 px-3 py-2"
            required
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-neutral-900">
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-control border border-neutral-300 px-3 py-2"
            required
          />
        </label>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-control bg-accent-600 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}

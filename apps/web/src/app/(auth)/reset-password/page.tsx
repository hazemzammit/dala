'use client';

import { passwordSchema } from '@dala/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.7 steps 4-5 — reached via /auth/confirm?type=recovery, which
 * has already exchanged the emailed token_hash for a real recovery session
 * (cookies set server-side). This page only needs to call
 * `updateUser({ password })` — no token handling here, that already happened.
 *
 * Step 5's "all existing sessions revoked" is handled by Supabase Auth
 * itself on password change, not by app code. This page's own remaining job
 * is marking password_reset_audit.completed_at via the
 * mark_latest_password_reset_completed() RPC (migration 0014).
 */
const newPasswordSchema = z.object({ new_password: passwordSchema });

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = newPasswordSchema.safeParse({ new_password: password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Mot de passe invalide.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // Best-effort — a failure here shouldn't block the user from continuing
    // now that their password is actually changed.
    await supabase.rpc('mark_latest_password_reset_completed');

    setLoading(false);
    router.push('/login');
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-card bg-neutral-0 w-full max-w-sm border border-neutral-100 p-8 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]"
      >
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Choisir un nouveau mot de passe
        </h1>

        <label className="mt-6 block text-sm font-medium text-neutral-900">
          Nouveau mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-control mt-1 w-full border border-neutral-300 px-3 py-2"
            required
            minLength={10}
          />
        </label>

        {error && <p className="text-danger mt-3 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-control bg-accent-600 mt-6 w-full py-2.5 font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </main>
  );
}

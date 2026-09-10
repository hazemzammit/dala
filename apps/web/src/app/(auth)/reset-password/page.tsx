'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { passwordSchema } from '@dala/validation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { createClient } from '@/lib/supabase/client';

/**
 * Doc 01 §1.3.7 steps 4-5 — reached via /auth/confirm?type=recovery, which
 * has already exchanged the emailed token_hash for a real recovery session
 * (cookies set server-side). This page only needs to call
 * `updateUser({ password })` — no token handling here, that already happened.
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

    await supabase.rpc('mark_latest_password_reset_completed');

    setLoading(false);
    router.push('/login');
  }

  return (
    <main className="bg-neutral-25 flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className="font-display text-[23px] font-semibold text-neutral-900">
          Choisir un nouveau mot de passe
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <FormField
              label="Nouveau mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
            <PasswordStrengthMeter password={password} />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <Button type="submit" fullWidth loading={loading} className="mt-2">
            Enregistrer
          </Button>
        </form>
      </Card>
    </main>
  );
}

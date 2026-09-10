'use client';

import { Button, FormField } from '@dala/ui-web';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login/step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Identifiants invalides.');
        return;
      }
      router.push(data.needsSetup ? '/totp-setup' : '/totp');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <FormField
        label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
      />
      <FormField
        label="Mot de passe"
        type="password"
        // Phase 19B item 3 — the shared FormField auto-shows a password
        // toggle for type="password" (matching Web's original behavior).
        // Admin's login field never had one; this keeps that unchanged.
        showPasswordToggle={false}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        error={error ?? undefined}
      />
      <Button type="submit" fullWidth loading={loading}>
        Continuer
      </Button>
    </form>
  );
}

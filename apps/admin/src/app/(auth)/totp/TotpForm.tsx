'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/Button';

export function TotpForm() {
  const router = useRouter();
  const inputId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login/step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Code invalide.');
        return;
      }
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-900">
          Code à 6 chiffres
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-center text-lg tracking-[0.3em] outline-none"
          autoFocus
        />
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" fullWidth loading={loading} disabled={code.length !== 6}>
        Se connecter
      </Button>
    </form>
  );
}

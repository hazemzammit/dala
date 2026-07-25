'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/Button';

export function TotpSetupForm() {
  const router = useRouter();
  const inputId = useId();
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/login/totp-setup')
      .then((res) => res.json())
      .then((data) => {
        if (data.secret) {
          setSecret(data.secret);
          setUri(data.uri);
        } else {
          setError(data.error ?? 'Impossible de démarrer la configuration.');
        }
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login/totp-setup', {
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
    <div className="mt-6 space-y-4">
      {secret ? (
        <div className="rounded-control bg-neutral-25 border border-neutral-100 p-3 text-xs">
          <p className="font-medium text-neutral-500">
            Clé secrète (si le QR n'est pas disponible) :
          </p>
          <p className="mt-1 break-all font-mono text-neutral-900">{secret}</p>
          {uri && (
            <p className="mt-2 break-all text-neutral-500">
              URI otpauth :<br />
              {uri}
            </p>
          )}
        </div>
      ) : (
        !error && <p className="text-sm text-neutral-500">Génération de la clé…</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
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
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" fullWidth loading={loading} disabled={code.length !== 6 || !secret}>
          Activer et se connecter
        </Button>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface QueryResult {
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number;
}

export function QueryEditor() {
  const [sql, setSql] = useState('');
  const [dangerZone, setDangerZone] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setError(null);
    setMessage(null);
    setResult(null);
    setLoading(true);
    try {
      if (dangerZone) {
        const res = await fetch('/api/admin/db-explorer/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, reason, dangerZoneConfirmed: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Erreur.');
          return;
        }
        setMessage(
          data.status === 'pending_approval'
            ? "Demande envoyée — en attente de l'approbation d'un second admin."
            : `Exécuté — ${data.rowCount} ligne(s) affectée(s).`,
        );
      } else {
        const res = await fetch('/api/admin/db-explorer/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Erreur.');
          return;
        }
        setResult(data);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        rows={6}
        placeholder="select * from organizations limit 20"
        className="rounded-control focus:border-accent-600 w-full border border-neutral-300 px-3 py-2.5 font-mono text-sm outline-none"
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-neutral-900">
          <input
            type="checkbox"
            checked={dangerZone}
            onChange={(e) => setDangerZone(e.target.checked)}
          />
          Zone dangereuse (INSERT / UPDATE / DELETE)
        </label>
        <Button
          variant={dangerZone ? 'danger' : 'primary'}
          onClick={run}
          loading={loading}
          disabled={!sql.trim() || (dangerZone && reason.trim().length < 10)}
        >
          {dangerZone ? 'Exécuter (zone dangereuse)' : 'Exécuter'}
        </Button>
      </div>

      {dangerZone && (
        <div>
          <label className="text-sm font-medium text-neutral-900">
            Motif (10 caractères minimum)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-sm outline-none"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Journalisé dans le journal d'audit. Si votre équipe compte 2+ admins, un second admin
            devra approuver avant exécution.
          </p>
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}
      {message && <p className="text-success text-sm">{message}</p>}

      {result && (
        <div className="rounded-control overflow-auto border border-neutral-100">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-neutral-25 border-b border-neutral-100">
                {result.fields.map((f) => (
                  <th
                    key={f}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500"
                  >
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  {result.fields.map((f) => (
                    <td key={f} className="px-3 py-2 text-neutral-900">
                      {String(row[f] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-2 text-xs text-neutral-500">{result.rowCount} ligne(s)</p>
        </div>
      )}
    </Card>
  );
}

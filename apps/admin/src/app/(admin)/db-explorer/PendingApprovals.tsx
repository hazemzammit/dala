'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAdminSession } from '@/lib/use-admin-session';

interface ApprovalRequest {
  id: string;
  requested_by_name: string;
  sql_statement: string;
  reason: string;
  created_at: string;
  canApprove: boolean;
}

export function PendingApprovals() {
  // Doc 04 §4.3.5 / §4.3 intro — approving a pending write requires the
  // same Super-Admin-only role the direct execute path requires
  // (api/admin/db-explorer/approvals/[requestId]/route.ts). Support/Admin
  // never see this panel at all, rather than seeing it and having every
  // decide() call 403.
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.admin.role === 'super_admin';

  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/db-explorer/approvals');
    const data = await res.json();
    setRequests(data.requests ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: 'approve' | 'reject') {
    const res = await fetch(`/api/admin/db-explorer/approvals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Erreur.');
      return;
    }
    await load();
  }

  if (!isSuperAdmin || loading || requests.length === 0) return null;

  return (
    <Card className="border-warning space-y-3 p-6">
      <h2 className="font-display text-base font-semibold text-neutral-900">
        Demandes d'approbation en attente
      </h2>
      {requests.map((r) => (
        <div key={r.id} className="rounded-control border border-neutral-100 p-4">
          <p className="text-xs text-neutral-500">
            Demandé par {r.requested_by_name} · {new Date(r.created_at).toLocaleString('fr-FR')}
          </p>
          <pre className="bg-neutral-25 mt-2 whitespace-pre-wrap break-all rounded p-2 font-mono text-xs text-neutral-900">
            {r.sql_statement}
          </pre>
          <p className="mt-2 text-sm text-neutral-900">Motif : {r.reason}</p>
          {r.canApprove ? (
            <div className="mt-3 flex gap-2">
              <Button variant="success" onClick={() => decide(r.id, 'approve')}>
                Approuver et exécuter
              </Button>
              <Button variant="danger" onClick={() => decide(r.id, 'reject')}>
                Rejeter
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-neutral-500">
              Vous avez soumis cette demande — un autre admin doit l'approuver.
            </p>
          )}
        </div>
      ))}
    </Card>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string } | null;
}

export function OrgDetail({ orgId }: { orgId: string }) {
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [impersonateTarget, setImpersonateTarget] = useState<Member | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/organizations/${orgId}`);
    if (!res.ok) return;
    const data = await res.json();
    setOrg(data.organization);
    setMembers(data.members ?? []);
  }

  useEffect(() => {
    load();
  }, [orgId]);

  async function startImpersonation(reason: string) {
    if (!impersonateTarget) return;
    const res = await fetch('/api/admin/impersonate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: impersonateTarget.user_id, orgId, reason }),
    });
    const data = await res.json();
    setImpersonateTarget(null);
    if (res.ok) {
      // Opens a new tab signed in as the target user via Supabase Auth's
      // own magic-link mechanism (Doc 04 §4.3.3a step 2) — this admin tab
      // keeps showing the impersonation banner/countdown independently.
      if (data.actionLink) window.open(data.actionLink, '_blank', 'noopener,noreferrer');
      window.location.reload();
    } else {
      alert(data.error ?? "Impossible de démarrer l'impersonation.");
    }
  }

  if (!org) return <p className="text-sm text-neutral-500">Chargement…</p>;

  const columns: DataTableColumn<Member>[] = [
    { key: 'name', header: 'Nom', render: (m) => m.profiles?.full_name ?? m.user_id },
    {
      key: 'role',
      header: 'Rôle',
      render: (m) => <StatusBadge variant="neutral">{m.role}</StatusBadge>,
    },
    {
      key: 'joined_at',
      header: 'Depuis',
      render: (m) => new Date(m.joined_at).toLocaleDateString('fr-FR'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <button
          onClick={() => setImpersonateTarget(m)}
          className="text-accent-600 text-xs font-medium hover:underline"
        >
          Impersonate
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-neutral-900">{org.name}</h1>
      </div>

      <Card className="p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500">
              Plan
            </dt>
            <dd className="mt-1 text-neutral-900">{org.plan}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500">
              Type d'activité
            </dt>
            <dd className="mt-1 text-neutral-900">{org.trade_type ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500">
              Statut
            </dt>
            <dd className="mt-1">
              {org.deleted_at ? (
                <StatusBadge variant="danger">Supprimée (récupérable)</StatusBadge>
              ) : org.suspended_at ? (
                <StatusBadge variant="warning">Suspendue</StatusBadge>
              ) : (
                <StatusBadge variant="success">Active</StatusBadge>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500">
              Créée le
            </dt>
            <dd className="mt-1 text-neutral-900">
              {new Date(org.created_at).toLocaleDateString('fr-FR')}
            </dd>
          </div>
        </dl>
      </Card>

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">Membres</h2>
        <DataTable columns={columns} rows={members} getRowId={(m) => m.user_id} />
      </div>

      {impersonateTarget && (
        <ConfirmTypingDialog
          title="Démarrer une impersonation"
          description="Doc 04 §4.3.3a — la session créée aura exactement les permissions de l'utilisateur cible, jamais plus. Le propriétaire de l'organisation sera notifié par email à la fin de la session."
          confirmValue={impersonateTarget.profiles?.full_name ?? impersonateTarget.user_id}
          confirmLabel="Démarrer"
          requireReason
          onConfirm={startImpersonation}
          onCancel={() => setImpersonateTarget(null)}
        />
      )}
    </div>
  );
}

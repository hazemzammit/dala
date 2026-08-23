'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { NotesPanel } from '@/components/ui/NotesPanel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAdminSession } from '@/lib/use-admin-session';

const RESTORE_WINDOW_DAYS = 30;

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string } | null;
}

export function OrgDetail({ orgId }: { orgId: string }) {
  // Doc 04 §4.3 intro — same defense-in-depth pattern as
  // OrganizationsTable.tsx: UI gating here is never the real check, the
  // role gate in api/admin/organizations/[orgId]/route.ts is.
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.admin.role === 'super_admin';

  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [impersonateTarget, setImpersonateTarget] = useState<Member | null>(null);
  const [restoring, setRestoring] = useState(false);

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

  async function restoreOrg() {
    setRestoring(true);
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "Impossible de restaurer l'organisation.");
      }
    } finally {
      setRestoring(false);
    }
  }

  if (!org) return <p className="text-sm text-neutral-500">Chargement…</p>;

  // Client-side only for the button's disabled state — restore_organization()
  // (0021) enforces the real 30-day cutoff server-side regardless.
  const deletedAt = org.deleted_at ? new Date(org.deleted_at) : null;
  const withinRestoreWindow = deletedAt
    ? Date.now() - deletedAt.getTime() < RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    : false;

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
            <dd className="mt-1 flex items-center gap-3">
              {org.deleted_at ? (
                <>
                  <StatusBadge variant="danger">Supprimée (récupérable)</StatusBadge>
                  {isSuperAdmin && (
                    <Button
                      variant="secondary"
                      onClick={restoreOrg}
                      disabled={!withinRestoreWindow}
                      loading={restoring}
                      className="px-2.5 py-1 text-xs"
                    >
                      Restaurer
                    </Button>
                  )}
                </>
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

      {/* Admin remediation Tier 4.8 */}
      <NotesPanel targetType="org" targetId={orgId} />

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

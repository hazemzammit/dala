'use client';

import { UsersThreeIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAdminSession } from '@/lib/use-admin-session';

interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  last_login_at: string | null;
  suspended_at: string | null;
  created_at: string;
  organizations: { name: string; role: string }[];
}

export function UsersTable() {
  // Doc 04 §4.3 intro — Support only gets "reset_password" server-side
  // (api/admin/users/[userId]/route.ts); every other action here is
  // hidden for Support so the UI doesn't dangle a button that 403s.
  const { data: session } = useAdminSession();
  const role = session?.admin.role;
  const canMutate = role === 'super_admin' || role === 'admin';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function action(user: UserRow, act: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? 'Action impossible.');
      return;
    }
    await load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await action(deleteTarget, 'delete', { confirmEmail: deleteTarget.email });
    setDeleteTarget(null);
  }

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: 'name',
      header: 'Nom',
      sortValue: (u) => u.full_name.toLowerCase(),
      render: (u) => u.full_name,
    },
    { key: 'email', header: 'Email', render: (u) => u.email ?? '—' },
    { key: 'phone', header: 'Téléphone', render: (u) => u.phone ?? '—' },
    {
      key: 'organizations',
      header: 'Organisation(s)',
      render: (u) => u.organizations.map((o) => `${o.name} (${o.role})`).join(', ') || '—',
    },
    {
      key: 'last_login_at',
      header: 'Dernière connexion',
      sortValue: (u) => u.last_login_at ?? '',
      render: (u) =>
        u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('fr-FR') : '—',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (u) =>
        u.suspended_at ? (
          <StatusBadge variant="warning">Suspendu</StatusBadge>
        ) : (
          <StatusBadge variant="success">Actif</StatusBadge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-3">
          <button
            onClick={() => action(u, 'reset_password')}
            className="text-accent-600 text-xs font-medium hover:underline"
          >
            Réinitialiser
          </button>
          {canMutate && (
            <>
              <button
                onClick={() => action(u, 'revoke_sessions')}
                className="text-accent-600 text-xs font-medium hover:underline"
              >
                Révoquer les sessions
              </button>
              <button
                onClick={() => action(u, u.suspended_at ? 'unsuspend' : 'suspend')}
                className="text-warning text-xs font-medium hover:underline"
              >
                {u.suspended_at ? 'Réactiver' : 'Suspendre'}
              </button>
              <button
                onClick={() => setDeleteTarget(u)}
                className="text-danger text-xs font-medium hover:underline"
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <>
      <DataTable
        columns={columns}
        rows={users}
        getRowId={(u) => u.id}
        emptyState={
          <EmptyState
            icon={UsersThreeIcon}
            title="Aucun utilisateur"
            description="Les comptes créés apparaîtront ici."
          />
        }
      />

      {deleteTarget && (
        <ConfirmTypingDialog
          title="Supprimer l'utilisateur"
          description="Doc 04 §4.3.4 — suppression définitive (RGPD/sur demande). Cette action est journalisée et irréversible."
          confirmValue={deleteTarget.email ?? deleteTarget.full_name}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

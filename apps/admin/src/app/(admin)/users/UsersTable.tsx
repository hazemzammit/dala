'use client';

import { UsersThreeIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ConfirmTypingDialog } from '@/components/ui/ConfirmTypingDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAdminSession } from '@/lib/use-admin-session';

const PAGE_SIZE = 50;

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

  // Admin remediation Tier 4.4 — GlobalSearch links here with `?q=` to
  // deep-link a name filter. Read once on mount (not kept in sync with
  // the URL afterward — this screen's own SearchInput becomes the source
  // of truth for `q` from that point on, same as every other filtered
  // list screen in this app that doesn't round-trip its filters through
  // the URL).
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(initialQ);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) params.set('q', q);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const data = await res.json();
    setUsers(data.users ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  function handleSearchChange(value: string) {
    setQ(value);
    setPage(1);
  }

  // Admin remediation Tier 4.3 — bulk suspend/unsuspend, the plan's own
  // "safest starting point" for this screen. Two separate actions rather
  // than a toggle — see api/admin/users/bulk/route.ts's header for why.
  async function runBulkSuspend(userIds: string[], suspend: boolean) {
    const verb = suspend ? 'suspendre' : 'réactiver';
    if (
      !window.confirm(`${suspend ? 'Suspendre' : 'Réactiver'} ${userIds.length} utilisateur(s) ?`)
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: suspend ? 'suspend' : 'unsuspend', targetIds: userIds }),
      });
      const data = await res.json();
      if (data.failureCount > 0) {
        alert(`${data.failureCount} échec(s) sur ${userIds.length} à ${verb}. Voir la console.`);
        console.error(
          '[bulk suspend] failures:',
          data.results?.filter((r: any) => !r.ok),
        );
      }
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

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
      // Admin remediation Tier 4.8 — links to the new minimal user-detail
      // view (notes only, per the plan's own scope cut — no full detail
      // page existed before this, and this doesn't build one beyond what
      // the notes panel needs).
      render: (u) => (
        <Link href={`/users/${u.id}`} className="text-accent-700 hover:underline">
          {u.full_name}
        </Link>
      ),
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

  return (
    <>
      <div className="mb-4">
        <SearchInput
          onChange={handleSearchChange}
          placeholder="Rechercher par nom, email, téléphone…"
          initialValue={initialQ}
        />
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          getRowId={(u) => u.id}
          // Doc 04 §4.3 intro — unlike Organizations (where Support can
          // still bulk-export, a read-only action), Users has no bulk
          // action Support is allowed to perform at all (both are
          // canMutate-gated), so selection itself is hidden for Support
          // rather than showing checkboxes that lead nowhere.
          selectable={canMutate}
          bulkActions={
            canMutate
              ? (ids) => (
                  <>
                    <button
                      onClick={() => runBulkSuspend(ids, true)}
                      disabled={bulkBusy}
                      className="text-danger text-xs font-medium hover:underline disabled:opacity-60"
                    >
                      Suspendre
                    </button>
                    <button
                      onClick={() => runBulkSuspend(ids, false)}
                      disabled={bulkBusy}
                      className="text-accent-700 text-xs font-medium hover:underline disabled:opacity-60"
                    >
                      Réactiver
                    </button>
                  </>
                )
              : undefined
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          emptyState={
            <EmptyState
              icon={UsersThreeIcon}
              title="Aucun utilisateur"
              description={
                q
                  ? 'Aucun utilisateur ne correspond à cette recherche.'
                  : 'Les comptes créés apparaîtront ici.'
              }
            />
          }
        />
      )}

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

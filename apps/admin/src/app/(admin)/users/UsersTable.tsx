'use client';

import {
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  IconActionButton,
  StatusBadge,
  TableSkeleton,
  ViewToggle,
} from '@dala/ui-web';
import {
  PauseCircleIcon,
  PasswordIcon,
  PlayCircleIcon,
  SignOutIcon,
  TrashIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SearchInput } from '@/components/ui/SearchInput';
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
  // Phase 20 (§1.7a) — same gap as OrganizationsTable/SessionsTable:
  // no res.ok check, no way to distinguish a failure from a genuinely
  // empty result.
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(initialQ);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  // Phase 5 (§5.4) — same FilterBar pattern as OrganizationsTable: a
  // client-side "Statut" filter over the already-fetched page (§0.8 —
  // no backend change) plus the table/card ViewToggle. 'table' stays the
  // fresh-load default (§0.5 default-state rule).
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q]);

  function handleSearchChange(value: string) {
    setQ(value);
    setPage(1);
  }

  // Same shape as OrganizationsTable's planFilter derivation: client-side
  // only, no page reset — it narrows the rows already fetched on this page.
  const visibleUsers =
    statusFilter === 'all'
      ? users
      : users.filter((u) => (statusFilter === 'active' ? !u.suspended_at : !!u.suspended_at));

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
      header: 'Actions',
      align: 'right',
      // Phase 5 (§5.4) — text action links → IconActionButton (§2.8). The
      // `label` prop is the old button's visible text VERBATIM (it becomes
      // both aria-label and title), so every accessible name resolves
      // exactly as before — including "Réinitialiser" exactly, which the
      // suite pins with an exact:true assertion. Role gating is unchanged:
      // Réinitialiser renders for every role (Support's only allowed user
      // action), the rest stay behind the same canMutate check that hid
      // the old text buttons.
      render: (u) => <div className="flex justify-end gap-2">{renderUserActions(u)}</div>,
    },
  ];

  // Shared by the table's actions column and the EntityCard actions slot —
  // one source of truth so the two views can never drift apart.
  function renderUserActions(user: UserRow) {
    return (
      <>
        <IconActionButton
          icon={PasswordIcon}
          label="Réinitialiser"
          tone="accent"
          onClick={() => action(user, 'reset_password')}
        />
        {canMutate && (
          <>
            <IconActionButton
              icon={SignOutIcon}
              label="Révoquer les sessions"
              tone="accent"
              onClick={() => action(user, 'revoke_sessions')}
            />
            <IconActionButton
              icon={user.suspended_at ? PlayCircleIcon : PauseCircleIcon}
              label={user.suspended_at ? 'Réactiver' : 'Suspendre'}
              tone="warning"
              onClick={() => action(user, user.suspended_at ? 'unsuspend' : 'suspend')}
            />
            <IconActionButton
              icon={TrashIcon}
              label="Supprimer"
              tone="danger"
              onClick={() => setDeleteTarget(user)}
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <FilterBar trailing={<ViewToggle value={viewMode} onChange={setViewMode} />}>
        <SearchInput
          onChange={handleSearchChange}
          placeholder="Rechercher par nom, email, téléphone…"
          initialValue={initialQ}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <span className="sr-only">Statut</span>
          <select
            aria-label="Statut"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700"
          >
            <option value="all">Tous</option>
            <option value="active">Actif</option>
            <option value="suspended">Suspendu</option>
          </select>
        </label>
      </FilterBar>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : viewMode === 'card' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleUsers.map((user) => (
            <EntityCard
              key={user.id}
              href={`/users/${user.id}`}
              title={user.full_name}
              subtitle={user.email ?? 'Email non renseigné'}
              badges={
                user.suspended_at ? (
                  <StatusBadge variant="warning">Suspendu</StatusBadge>
                ) : (
                  <StatusBadge variant="success">Actif</StatusBadge>
                )
              }
              fields={[
                { label: 'Téléphone', value: user.phone ?? '—' },
                {
                  label: 'Organisation(s)',
                  value: user.organizations.map((o) => `${o.name} (${o.role})`).join(', ') || '—',
                },
                {
                  label: 'Dernière connexion',
                  value: user.last_login_at
                    ? new Date(user.last_login_at).toLocaleDateString('fr-FR')
                    : '—',
                },
              ]}
              actions={renderUserActions(user)}
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={visibleUsers}
          getRowId={(u) => u.id}
          // Doc 04 §4.3 intro — unlike Organizations (where Support can
          // still bulk-export, a read-only action), Users has no bulk
          // action Support is allowed to perform at all (both are
          // canMutate-gated), so selection itself is hidden for Support
          // rather than showing checkboxes that lead nowhere.
          selectable={canMutate}
          // Phase 19B item 3 — preserves Admin's pre-extraction behavior
          // exactly: this component used to always clear selection when
          // `rows` changed, unconditionally. The shared component now
          // makes that opt-in (Web's DataTable never had it), so this
          // flag is set explicitly rather than silently dropped.
          resetSelectionOnRowsChange
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

'use client';

import {
  Avatar,
  ColumnPicker,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  DensityToggle,
  EmptyState,
  EntityCard,
  ErrorState,
  FilterBar,
  FilterSelect,
  IconActionButton,
  NoResultsState,
  StatusBadge,
  TableSkeleton,
  useToast,
  ViewToggle,
} from '@dala/ui-web';
import {
  DotsThreeVerticalIcon,
  PauseCircleIcon,
  PasswordIcon,
  PlayCircleIcon,
  SignOutIcon,
  TrashIcon,
  type Icon,
  UsersThreeIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

import { SearchInput } from '@/components/ui/SearchInput';
import {
  applyColumnState,
  DEFAULT_TABLE_PREFS,
  readTablePrefs,
  writeTablePrefs,
  type TablePrefs,
} from '@/lib/table-preferences';
import { useAdminSession } from '@/lib/use-admin-session';

const PAGE_SIZE = 50;

type RowMenuTone = 'success' | 'danger' | 'warning' | 'neutral';

interface RowMenuItem {
  label: string;
  icon: Icon;
  tone: RowMenuTone;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
}

const menuToneClasses: Record<RowMenuTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-neutral-700 hover:text-neutral-900',
};

/**
 * Phase 5.2 (premium-ux-system-guide.md §6.1/§18) — a single `•••` trigger
 * per row replacing the 1–4 inline IconActionButtons. Items keep their
 * exact former labels (aria-label/title of the old buttons), including the
 * dynamic Suspendre/Réactiver pair. No spec asserts any of these accessible
 * names on /users today (the only exact:true 'Réinitialiser' assertion is
 * admin-users' ConfirmTypingDialog confirm button on /admin-users), so the
 * conversion is assertion-neutral.
 *
 * The menu is portaled to <body> with position:fixed because DataTable's
 * Card wrapper is overflow-hidden (and EntityCard's Card likewise), which
 * would clip an in-flow absolute menu past the table edge. ESC and
 * outside-click close; focus returns to the trigger. Arrow-key roving
 * focus is deliberately not built (§12 [DECISION] — deferred).
 */
function RowActionsMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      wrapRef.current?.querySelector('button')?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  // Flip above the trigger when opening would overflow the viewport bottom.
  useEffect(() => {
    if (!open || !menuRef.current || !wrapRef.current) return;
    const t = wrapRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let top = t.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, t.top - m.height - 4);
    const left = Math.max(8, t.right - m.width);
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const t = wrapRef.current?.getBoundingClientRect();
    if (t) setPos({ top: t.bottom + 4, left: Math.max(8, t.right - 208) }); // 208 = w-52
    setOpen(true);
  }

  return (
    <span ref={wrapRef} className="relative inline-flex justify-end">
      <IconActionButton
        icon={DotsThreeVerticalIcon}
        label="Actions"
        tone="neutral"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Actions"
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
            className="bg-neutral-0 w-52 rounded-lg border border-neutral-200 py-1 shadow-[0_8px_24px_rgba(17,19,24,0.12)]"
          >
            {items.map((item) => {
              const itemClass = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium ${menuToneClasses[item.tone]} disabled:cursor-not-allowed disabled:opacity-60`;
              if (item.href !== undefined) {
                return (
                  <a
                    key={item.label}
                    role="menuitem"
                    href={item.href}
                    className={itemClass}
                    onClick={() => setOpen(false)}
                  >
                    <item.icon size={16} weight="bold" aria-hidden="true" />
                    {item.label}
                  </a>
                );
              }
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                >
                  <item.icon size={16} weight="bold" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * This user row's menu items, in the exact former inline-button order:
 * Réinitialiser (always — Support's only allowed user action), then behind
 * canMutate: Révoquer les sessions, the dynamic Suspendre/Réactiver pair,
 * and Supprimer (delete goes through the ConfirmTypingDialog, unchanged).
 */
interface UserRowActionsProps {
  user: UserRow;
  canMutate: boolean;
  onAction: (act: 'reset_password' | 'revoke_sessions' | 'suspend' | 'unsuspend') => void;
  onDelete: (user: UserRow) => void;
}

function UserRowActions({ user, canMutate, onAction, onDelete }: UserRowActionsProps) {
  const items: RowMenuItem[] = [
    {
      label: 'Réinitialiser',
      icon: PasswordIcon,
      tone: 'neutral',
      onSelect: () => onAction('reset_password'),
    },
  ];
  if (canMutate) {
    items.push(
      {
        label: 'Révoquer les sessions',
        icon: SignOutIcon,
        tone: 'danger',
        onSelect: () => onAction('revoke_sessions'),
      },
      {
        label: user.suspended_at ? 'Réactiver' : 'Suspendre',
        icon: user.suspended_at ? PlayCircleIcon : PauseCircleIcon,
        tone: 'warning',
        onSelect: () => onAction(user.suspended_at ? 'unsuspend' : 'suspend'),
      },
      {
        label: 'Supprimer',
        icon: TrashIcon,
        tone: 'danger',
        onSelect: () => onDelete(user),
      },
    );
  }
  return <RowActionsMenu items={items} />;
}

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

  // Phase 6.3 (§9/§18) — undo-toast for the suspend/unsuspend action. Mounted
  // once per page in (admin)/layout.tsx via <ToastProvider>; callable here for
  // the toast the immediate-fire suspend/unsuspend flow shows.
  const toast = useToast();

  // Phase 5.3 (premium-ux-system-guide.md §15/§18) — filter/view/page live
  // in the URL as the single source of truth (shareable, reload-stable),
  // replacing four local useStates. Every write goes through setParams()
  // → router.replace({ scroll: false }); defaults are never serialized, so
  // a param-less URL behaves exactly as before (test contract: fresh loads
  // start table/page 1). `q` keeps the exact `?q=` key GlobalSearch
  // deep-links with (Tier 4.4); sort is NOT URL-backed this step — it lives
  // inside DataTable (ui-web), which exposes no controlled sort props;
  // flagged, not silently skipped.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page')) || 1;
  // Phase 5 (§5.4) — same FilterBar pattern as OrganizationsTable: a
  // client-side "Statut" filter over the already-fetched page (§0.8 —
  // no backend change) plus the table/card ViewToggle. 'table' stays the
  // fresh-load default (§0.5 default-state rule).
  const rawStatus = searchParams.get('status');
  const statusFilter = rawStatus === 'active' || rawStatus === 'suspended' ? rawStatus : 'all';
  const viewMode: 'table' | 'card' = searchParams.get('view') === 'card' ? 'card' : 'table';

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Same names/signatures as the useStates they replace, so the FilterBar /
  // ViewToggle / pagination call sites below stay byte-identical.
  function setPage(next: number) {
    setParams({ page: next === 1 ? null : String(next) });
  }

  function setStatusFilter(next: string) {
    setParams({ status: next === 'all' ? null : next });
  }

  function setViewMode(next: 'table' | 'card') {
    setParams({ view: next === 'card' ? 'card' : null });
  }

  // Phase 5.4 (§7) — "no data at all" vs "filters matched nothing" is
  // decided by whether ANY filter/search value is set, not rows.length.
  const hasActiveFilters = Boolean(q) || statusFilter !== 'all';

  function resetFilters() {
    setParams({ q: null, status: null, page: null });
  }

  // Phase 5.5 (§6.3/6.4, §15) — per-table column visibility/reorder +
  // density, persisted in localStorage (dala-admin-table-users-prefs;
  // extends the sidebar's dala-admin-* key convention). Read on mount like
  // the sidebar (SSR-safe): first paint is the defaults, then stored prefs
  // settle in — fresh loads with no stored prefs are byte-identical (test
  // contract).
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_TABLE_PREFS);
  useEffect(() => {
    setPrefs(readTablePrefs('users'));
  }, []);

  function updatePrefs(next: TablePrefs) {
    setPrefs(next);
    writeTablePrefs('users', next);
  }

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as OrganizationsTable/SessionsTable:
  // no res.ok check, no way to distinguish a failure from a genuinely
  // empty result.
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

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
    // Single setParams call — the page-1 reset and the new query must land
    // in the same URL write (two sequential replace()s would each build
    // from the pre-navigation searchParams).
    setParams({ q: value, page: null });
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

  async function action(
    user: UserRow,
    act: string,
    extra: Record<string, unknown> = {},
    // Phase 6.3 (§9) — the undo toast's "Annuler" tap calls back into action()
    // for the reverse action with showToast=false, so reversing doesn't spawn
    // a second toast (no toast chain).
    showToast = true,
  ) {
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
    // Phase 6.3 (premium-ux-system-guide.md §9/§18) — suspend/unsuspend are
    // reversible, low-blast-radius actions, so the guide routes them to an undo
    // toast instead of a confirmation dialog. reset_password / revoke_sessions /
    // delete are one-shot actions with no natural undo and never reach here.
    if (showToast && (act === 'suspend' || act === 'unsuspend')) {
      const willBeSuspended = act === 'suspend';
      const name = user.full_name?.trim() || user.email || "l'utilisateur";
      toast(`${name} ${willBeSuspended ? 'suspendu' : 'réactivé'}`, {
        action: {
          label: 'Annuler',
          onClick: () => {
            void action(user, willBeSuspended ? 'unsuspend' : 'suspend', {}, false);
          },
        },
      });
    }
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
        <div className="flex items-center gap-2">
          <Avatar name={u.full_name} size={28} />
          <Link
            href={`/users/${u.id}`}
            className="group-hover:text-accent-700 font-semibold text-neutral-900"
          >
            {u.full_name}
          </Link>
        </div>
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
      // Phase 5.2 (premium-ux-system-guide.md §6.1/§18) — row actions moved
      // into a single ••• menu (RowActionsMenu below). The menu items keep
      // the old IconActionButtons' accessible names verbatim, including the
      // dynamic Suspendre/Réactiver pair; role gating is unchanged —
      // Réinitialiser still renders for every role (Support's only allowed
      // user action), the rest stay behind the same canMutate check that
      // hid the old buttons. (The old comment's claim that the suite pins
      // "Réinitialiser" with an exact:true assertion was stale — that
      // assertion is admin-users' ConfirmTypingDialog confirm button on
      // /admin-users, a different screen; nothing asserts this table's
      // row-action names today.)
      render: (u) => <div className="flex justify-end gap-2">{renderUserActions(u)}</div>,
    },
  ];

  // Phase 5.5 — picker inputs (§6.3/6.4). 'Actions' is locked: hiding the
  // row menu would strand every action. Card view ignores columns
  // (EntityCard), so this only affects the table.
  const currentOrder = prefs.order.length ? prefs.order : columns.map((c) => c.key);
  const pickerColumns = columns.map((c) => ({
    key: c.key,
    header: c.header,
    locked: c.key === 'actions',
  }));
  const displayColumns = applyColumnState(columns, { ...prefs, order: currentOrder });

  function toggleColumn(key: string) {
    updatePrefs({
      ...prefs,
      hiddenKeys: prefs.hiddenKeys.includes(key)
        ? prefs.hiddenKeys.filter((k) => k !== key)
        : [...prefs.hiddenKeys, key],
      order: currentOrder,
    });
  }

  function moveColumn(key: string, direction: -1 | 1) {
    const order = [...currentOrder];
    const index = order.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    // noUncheckedIndexedAccess: element reads are string | undefined —
    // guard both before the swap.
    const moved = order[index];
    const neighbor = order[target];
    if (moved === undefined || neighbor === undefined) return;
    order[index] = neighbor;
    order[target] = moved;
    updatePrefs({ ...prefs, order });
  }

  function resetPrefs() {
    updatePrefs(DEFAULT_TABLE_PREFS);
  }

  // Shared by the table's actions column and the EntityCard actions slot —
  // one source of truth so the two views can never drift apart.
  function renderUserActions(user: UserRow) {
    return (
      <UserRowActions
        user={user}
        canMutate={canMutate}
        onAction={(act) => void action(user, act)}
        onDelete={(u) => setDeleteTarget(u)}
      />
    );
  }

  return (
    <>
      <FilterBar
        trailing={
          <div className="flex items-center gap-2">
            <ColumnPicker
              columns={pickerColumns}
              hiddenKeys={prefs.hiddenKeys}
              order={currentOrder}
              onToggle={toggleColumn}
              onMove={moveColumn}
              onReset={resetPrefs}
            />
            <DensityToggle
              value={prefs.density}
              onChange={(density) => updatePrefs({ ...prefs, density })}
            />
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        }
      >
        <SearchInput
          onChange={handleSearchChange}
          placeholder="Rechercher par nom, email, téléphone…"
          initialValue={q}
          value={q}
        />
        <FilterSelect
          aria-label="Statut"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'active', label: 'Actif' },
            { value: 'suspended', label: 'Suspendu' },
          ]}
        />
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
          columns={displayColumns}
          rows={visibleUsers}
          getRowId={(u) => u.id}
          density={prefs.density}
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
            hasActiveFilters ? (
              <NoResultsState term={q || undefined} onClearFilters={resetFilters} />
            ) : (
              <EmptyState
                icon={UsersThreeIcon}
                title="Aucun utilisateur"
                description="Les comptes créés apparaîtront ici."
              />
            )
          }
        />
      )}

      {deleteTarget && (
        <ConfirmTypingDialog
          title="Supprimer l'utilisateur"
          description="Suppression définitive (RGPD/sur demande). Cette action est journalisée et irréversible."
          confirmValue={deleteTarget.email ?? deleteTarget.full_name}
          confirmLabel="Supprimer"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

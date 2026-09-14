'use client';

import {
  Card,
  ColumnPicker,
  DataTable,
  type DataTableColumn,
  DensityToggle,
  EmptyState,
  ErrorState,
  FilterBar,
  IconActionButton,
  NoResultsState,
  PlanBadge,
  StatStrip,
  StatusBadge,
  TableSkeleton,
} from '@dala/ui-web';
import {
  BuildingsIcon,
  CalendarPlusIcon,
  CheckCircleIcon,
  DotsThreeVerticalIcon,
  PercentIcon,
  type Icon,
  XIcon,
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

interface SubscriptionRow {
  orgId: string;
  orgName: string;
  plan: string;
  subscriptionStatus: string;
  seatCount: number | null;
  currentCycleAmountMillimes: number | null;
  billingCycleStart: string;
  lastCycleStatus: string | null;
  lastCyclePaidAt: string | null;
}

interface PlanCount {
  plan: string;
  count: number;
}

function formatTnd(millimes: number | null): string {
  if (millimes === null) return '—';
  return `${(millimes / 1000).toFixed(3)} TND`;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  active: 'success',
  trialing: 'info',
  past_due: 'warning',
  canceled: 'danger',
};

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
 * per row replacing the four showLabel IconActionButtons (this is the
 * Billing copy of the same file-local menu used by OrganizationsTable and
 * UsersTable). Items keep their exact former labels (none of them is
 * test-asserted — billing.spec.ts and rbac.spec.ts exercise this screen
 * through the API only).
 *
 * The menu is portaled to <body> with position:fixed because DataTable's
 * Card wrapper is overflow-hidden, which would clip an in-flow absolute
 * menu past the table edge. ESC and outside-click close; focus returns to
 * the trigger. Arrow-key roving focus is deliberately not built (§12
 * [DECISION] — deferred).
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

interface BillingRowActionsProps {
  busy: boolean;
  onAction: (action: 'extend_expiry' | 'manual_discount' | 'mark_paid' | 'cancel') => void;
}

/**
 * This row's menu items, in the exact former inline-button order, with the
 * same per-row busy gating (all four freeze while that org's action is in
 * flight). The window.prompt / window.confirm flows inside runAction are
 * untouched — only the trigger and layout changed. The row itself is bound
 * at the call site via the onAction closure, so this component doesn't
 * need it as a prop.
 */
function BillingRowActions({ busy, onAction }: BillingRowActionsProps) {
  const items: RowMenuItem[] = [
    {
      label: 'Prolonger',
      icon: CalendarPlusIcon,
      tone: 'neutral',
      onSelect: () => onAction('extend_expiry'),
      disabled: busy,
    },
    {
      label: 'Remise',
      icon: PercentIcon,
      tone: 'neutral',
      onSelect: () => onAction('manual_discount'),
      disabled: busy,
    },
    {
      label: 'Payé hors Konnect',
      icon: CheckCircleIcon,
      tone: 'success',
      onSelect: () => onAction('mark_paid'),
      disabled: busy,
    },
    {
      label: 'Annuler',
      icon: XIcon,
      tone: 'danger',
      onSelect: () => onAction('cancel'),
      disabled: busy,
    },
  ];
  return <RowActionsMenu items={items} />;
}

export function BillingTable() {
  // Doc 04 §4.3 intro — every action here is a financial data change,
  // outside Support's boundary (server-gated too, in api/admin/billing —
  // this is defense-in-depth only).
  const { data: session } = useAdminSession();
  const canManage = session?.admin.role === 'super_admin' || session?.admin.role === 'admin';

  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [distribution, setDistribution] = useState<PlanCount[]>([]);
  const [mrrMillimes, setMrrMillimes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  // Phase 4.7 (Step 8) - client-side search by org name (no API change;
  // the billing GET route takes no params and the full set is loaded).
  // Phase 5.3 (premium-ux-system-guide.md §15) — `q` now round-trips
  // through the URL (shareable, reload-stable), omitted when empty so a
  // param-less URL behaves exactly as before.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get('q') ?? '';

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/billing');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Erreur inconnue.');
    } else {
      setSubscriptions(data.subscriptions ?? []);
      setDistribution(data.planDistribution ?? []);
      setMrrMillimes(data.mrrMillimes ?? 0);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleSearchChange(value: string) {
    setParams({ q: value });
  }

  // Phase 5.4 (§7) — "no data at all" vs "search matched nothing" is
  // decided by whether the search value is set, not rows.length.
  const hasActiveFilters = Boolean(q);

  function resetFilters() {
    setParams({ q: null });
  }

  // Phase 5.5 (§6.3/6.4, §15) — per-table column visibility/reorder +
  // density, persisted in localStorage (dala-admin-table-billing-prefs;
  // extends the sidebar's dala-admin-* key convention). Read on mount like
  // the sidebar (SSR-safe): first paint is the defaults, then stored prefs
  // settle in — fresh loads with no stored prefs are byte-identical (test
  // contract).
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_TABLE_PREFS);
  useEffect(() => {
    setPrefs(readTablePrefs('billing'));
  }, []);

  function updatePrefs(next: TablePrefs) {
    setPrefs(next);
    writeTablePrefs('billing', next);
  }

  async function runAction(
    row: SubscriptionRow,
    action: 'extend_expiry' | 'manual_discount' | 'mark_paid' | 'cancel',
  ) {
    let extra: Record<string, unknown> = {};
    if (action === 'extend_expiry') {
      const days = window.prompt('Prolonger le cycle actuel de combien de jours ?', '7');
      if (days === null) return;
      extra = { days: Number(days) };
    }
    if (action === 'manual_discount') {
      const amount = window.prompt('Montant de la remise (en millimes, 1 TND = 1000) ?', '5000');
      if (amount === null) return;
      extra = { discountMillimes: Number(amount) };
    }
    if (action === 'cancel' && !window.confirm(`Annuler l'abonnement de ${row.orgName} ?`)) {
      return;
    }

    setBusyOrgId(row.orgId);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: row.orgId, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? 'Action impossible.');
        return;
      }
      await load();
    } finally {
      setBusyOrgId(null);
    }
  }

  const visibleSubscriptions = q
    ? subscriptions.filter((s) => s.orgName.toLowerCase().includes(q.toLowerCase()))
    : subscriptions;

  const columns: DataTableColumn<SubscriptionRow>[] = [
    {
      key: 'orgName',
      header: 'Organisation',
      sortValue: (r) => r.orgName.toLowerCase(),
      render: (r) => (
        <Link
          href={`/organizations/${r.orgId}`}
          className="group-hover:text-accent-700 font-semibold text-neutral-900"
        >
          {r.orgName}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan,
      render: (r) => <PlanBadge plan={r.plan} />,
    },
    {
      key: 'subscriptionStatus',
      header: 'Statut',
      render: (r) => (
        <StatusBadge variant={STATUS_VARIANT[r.subscriptionStatus] ?? 'info'}>
          {r.subscriptionStatus}
        </StatusBadge>
      ),
    },
    {
      key: 'seatCount',
      header: 'Sièges',
      align: 'right',
      sortValue: (r) => r.seatCount ?? 0,
      render: (r) => r.seatCount ?? '—',
    },
    {
      key: 'currentCycleAmountMillimes',
      header: 'Montant du cycle',
      align: 'right',
      sortValue: (r) => r.currentCycleAmountMillimes ?? 0,
      render: (r) => formatTnd(r.currentCycleAmountMillimes),
    },
    {
      key: 'billingCycleStart',
      header: 'Début du cycle',
      sortValue: (r) => r.billingCycleStart,
      render: (r) => new Date(r.billingCycleStart).toLocaleDateString('fr-FR'),
    },
    {
      key: 'lastCycleStatus',
      header: 'Dernier paiement',
      render: (r) =>
        r.lastCycleStatus ? (
          <span className="text-xs text-neutral-500">
            {r.lastCycleStatus}
            {r.lastCyclePaidAt
              ? ` · ${new Date(r.lastCyclePaidAt).toLocaleDateString('fr-FR')}`
              : ''}
          </span>
        ) : (
          '—'
        ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            render: (r: SubscriptionRow) => (
              <BillingRowActions
                busy={busyOrgId === r.orgId}
                onAction={(action) => runAction(r, action)}
              />
            ),
          },
        ]
      : []),
  ];

  // Phase 5.5 — picker inputs (§6.3/6.4). 'Actions' is locked (the row's
  // ••• menu) and only exists for admin/super_admin; its header is ''
  // today, so the picker labels the row 'Actions' for display only. For
  // support (no actions column) the picker lists the 7 data columns.
  const currentOrder = prefs.order.length ? prefs.order : columns.map((c) => c.key);
  const pickerColumns = columns.map((c) => ({
    key: c.key,
    header: c.header || 'Actions',
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

  if (error) {
    return (
      <Card className="mt-6 p-8">
        <ErrorState description={error} onRetry={() => void load()} />
      </Card>
    );
  }

  // Phase 5 (§5.8) — one-off "Chargement…" paragraph → TableSkeleton, the
  // same loading treatment OrganizationsTable/UsersTable already use.
  if (loading) {
    return (
      <div className="mt-6">
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3">
        <StatStrip
          items={[
            { label: 'MRR', value: formatTnd(mrrMillimes) },
            ...distribution.map((d) => ({ label: d.plan, value: d.count })),
          ]}
        />
      </div>
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
          </div>
        }
      >
        <SearchInput
          onChange={handleSearchChange}
          placeholder="Rechercher par nom d'organisation…"
          value={q}
        />
      </FilterBar>
      <DataTable
        columns={displayColumns}
        rows={visibleSubscriptions}
        getRowId={(r) => r.orgId}
        density={prefs.density}
        emptyState={
          hasActiveFilters ? (
            <NoResultsState term={q || undefined} onClearFilters={resetFilters} />
          ) : (
            <EmptyState
              icon={BuildingsIcon}
              title="Aucune organisation"
              description="Pas encore d'organisations dans cet environnement."
            />
          )
        }
      />
    </div>
  );
}

'use client';

import {
  Avatar,
  ColumnPicker,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  DensityToggle,
  EntityCard,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSelect,
  IconActionButton,
  NoResultsState,
  PlanBadge,
  TableSkeleton,
  ToggleChip,
  TypeChip,
  ViewToggle,
  useToast,
} from '@dala/ui-web';
import {
  BuildingsIcon,
  CheckIcon,
  DownloadSimpleIcon,
  DotsThreeVerticalIcon,
  PauseCircleIcon,
  TrashIcon,
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

const PAGE_SIZE = 50;

/**
 * Phase 6.3 (premium-ux-system-guide.md §9/§18) — the undo-toast suspend flow
 * fires immediately (no ConfirmTypingDialog), so the audit-log reason is a
 * fixed default rather than a typed-in value. Must stay >= 10 chars to satisfy
 * api/admin/organizations/[orgId]/route.ts's destructive-action validation
 * (suspend is in its `destructive` array and the server re-checks reason length
 * regardless of how the client gathered it).
 */
const SUSPEND_REASON = 'Suspension administrative';

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
 * Phase 5.2 (premium-ux-system-guide.md §6.1/§18) — one `•••` trigger per
 * row replacing the 1–4 inline IconActionButtons. Items keep their exact
 * former labels; "Suspendre"/"Supprimer" are test-asserted strings, now
 * role="menuitem" instead of role="button" (rbac.spec.ts's not.toBeVisible
 * assertions still hold: the elements simply don't exist for roles that
 * lack them). Portaled to <body> with position:fixed because DataTable's
 * Card wrapper is overflow-hidden (EntityCard's too) and would clip an
 * in-flow menu past the table edge — guaranteed with a one-row table, the
 * e2e seed's exact case. ESC/outside-click close; focus returns to the
 * trigger. Arrow-key roving focus: deliberately not built (§12 [DECISION]).
 */
function RowActionsMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || wrapRef.current?.contains(t)) return;
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
 * This org row's menu items, in the exact former inline-button order:
 * Approuver/Refuser (queue view + canSuspend, disabled while bulkBusy),
 * Suspendre (canSuspend), Supprimer (super_admin only), Exporter (always,
 * same download href). Conditions mirror the two former copies verbatim.
 */
interface OrgRowActionsProps {
  org: OrgRow;
  verificationQueueOnly: boolean;
  canSuspend: boolean;
  canSoftDelete: boolean;
  bulkBusy: boolean;
  onVerification: (action: 'verify_org' | 'reject_org_verification') => void;
  /** Phase 6.3 — fires suspend immediately; the caller shows the undo-toast. */
  onSuspend: () => void;
  /** Phase 6.3 — only soft_delete still routes through ConfirmTypingDialog. */
  onPending: (action: 'soft_delete') => void;
}

function OrgRowActions({
  org,
  verificationQueueOnly,
  canSuspend,
  canSoftDelete,
  bulkBusy,
  onVerification,
  onSuspend,
  onPending,
}: OrgRowActionsProps) {
  const items: RowMenuItem[] = [];
  if (verificationQueueOnly && canSuspend) {
    items.push(
      {
        label: 'Approuver',
        icon: CheckIcon,
        tone: 'success',
        onSelect: () => onVerification('verify_org'),
        disabled: bulkBusy,
      },
      {
        label: 'Refuser',
        icon: XIcon,
        tone: 'danger',
        onSelect: () => onVerification('reject_org_verification'),
        disabled: bulkBusy,
      },
    );
  }
  if (canSuspend) {
    items.push({ label: 'Suspendre', icon: PauseCircleIcon, tone: 'warning', onSelect: onSuspend });
  }
  if (canSoftDelete) {
    items.push({
      label: 'Supprimer',
      icon: TrashIcon,
      tone: 'danger',
      onSelect: () => onPending('soft_delete'),
    });
  }
  items.push({
    label: 'Exporter',
    icon: DownloadSimpleIcon,
    tone: 'neutral',
    href: `/api/admin/organizations/${org.id}/export?format=json`,
  });
  return <RowActionsMenu items={items} />;
}

interface OrgRow {
  id: string;
  name: string;
  trade_type: string | null;
  plan: string;
  created_at: string;
  member_count: number;
  storage_used_bytes?: number;
  verification_status?: string;
  verification_requested_at?: string | null;
  logo_signed_url?: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Mo';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} Mo`;
  return `${(mb / 1024).toFixed(2)} Go`;
}

export function OrganizationsTable() {
  // Doc 04 §4.3 intro — UI gating is defense-in-depth on top of the real
  // server-side role check in api/admin/organizations/[orgId]/route.ts,
  // never a substitute for it: a Support admin shouldn't see a button
  // they'll only get a 403 from, but the 403 is what actually protects
  // the data either way.
  const { data: session } = useAdminSession();
  const role = session?.admin.role;
  const canSuspend = role === 'super_admin' || role === 'admin';
  const canSoftDelete = role === 'super_admin';
  const canBulkChangePlan = role === 'super_admin' || role === 'admin';

  // Phase 6.3 (§9) — undo-toast for the suspend action. Mounted once per page
  // in (admin)/layout.tsx via <ToastProvider>; callable here for the toast
  // the immediate-fire suspend flow shows.
  const toast = useToast();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — this fetch had no error handling at all: a
  // failed response wasn't checked (`res.ok`), so a server error or
  // network failure either threw uncaught from `res.json()` on a
  // non-JSON body (leaving `loading` stuck true forever, no retry) or
  // silently rendered "Aucune organisation," indistinguishable from a
  // genuinely empty result.
  const [loadError, setLoadError] = useState(false);
  // Phase 5.3 (premium-ux-system-guide.md §15/§18) — filter/view/page live
  // in the URL as the single source of truth (shareable, reload-stable),
  // replacing five local useStates. Every write goes through setParams()
  // → router.replace({ scroll: false }); defaults are never serialized, so
  // a param-less URL behaves exactly as before (test contract: fresh loads
  // start table/page 1). Sort is NOT URL-backed this step — it lives inside
  // DataTable (ui-web), which exposes no controlled sort props; flagged,
  // not silently skipped.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get('q') ?? '';
  const page = Number(searchParams.get('page')) || 1;
  const rawPlan = searchParams.get('plan');
  const planFilter =
    rawPlan === 'free' || rawPlan === 'pro' || rawPlan === 'business' ? rawPlan : 'all';
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

  function setPlanFilter(next: string) {
    setParams({ plan: next === 'all' ? null : next });
  }

  function setViewMode(next: 'table' | 'card') {
    setParams({ view: next === 'card' ? 'card' : null });
  }

  const [total, setTotal] = useState(0);
  // Audit fix 3b (Option B) — the admin approval queue tab. A plain
  // client-side toggle on top of the existing search/pagination state,
  // same shape as `q` — flips ?verificationPending=1 on the list route
  // rather than a separate screen for what's still the same table.
  const verificationQueueOnly = searchParams.get('verificationPending') === '1';
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    org: OrgRow;
    // Phase 6.3 — suspend moved to the immediate-fire undo-toast flow
    // (runSuspend below); only soft_delete still opens ConfirmTypingDialog.
    action: 'soft_delete';
  } | null>(null);

  // Phase 5.4 (§7) — "no data at all" vs "filters matched nothing" is
  // decided by whether ANY filter/search value is set, not rows.length.
  const hasActiveFilters = Boolean(q) || planFilter !== 'all' || verificationQueueOnly;

  function resetFilters() {
    setParams({ q: null, plan: null, verificationPending: null, page: null });
  }

  // Phase 5.5 (§6.3/6.4, §15) — per-table column visibility/reorder +
  // density, persisted in localStorage (dala-admin-table-organizations-prefs;
  // extends the sidebar's dala-admin-* key convention). Read on mount like
  // the sidebar (SSR-safe): first paint is the defaults, then stored prefs
  // settle in — fresh loads with no stored prefs are byte-identical (test
  // contract).
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_TABLE_PREFS);
  useEffect(() => {
    setPrefs(readTablePrefs('organizations'));
  }, []);

  function updatePrefs(next: TablePrefs) {
    setPrefs(next);
    writeTablePrefs('organizations', next);
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      if (verificationQueueOnly) params.set('verificationPending', '1');
      const res = await fetch(`/api/admin/organizations?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setOrgs(data.organizations ?? []);
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
  }, [page, q, verificationQueueOnly]);

  function toggleVerificationQueue(value: boolean) {
    // Single setParams call — two sequential replace()s would each build
    // from the pre-navigation searchParams, so the page-1 reset and the
    // toggle must land in the same URL write.
    setParams({ verificationPending: value ? '1' : null, page: null });
  }

  function handleSearchChange(value: string) {
    // Same "any filter change resets to page 1" convention (Tier 4.1) —
    // and the same single-write rule as toggleVerificationQueue.
    setParams({ q: value === '' ? null : value, page: null });
  }

  const visibleOrgs = planFilter === 'all' ? orgs : orgs.filter((org) => org.plan === planFilter);

  // Admin remediation Tier 4.3 — the two safest bulk actions only (see
  // this file's own bulk route header for why suspend/soft-delete aren't
  // here). window.confirm() rather than the heavier ConfirmTypingDialog —
  // deliberate: these two actions aren't in the destructive tier
  // (change_plan is reversible, export is read-only), so the same typed-
  // confirmation weight the single-org suspend/delete flows use would be
  // disproportionate here.
  async function runBulkChangePlan(orgIds: string[]) {
    const plan = window.prompt(
      `Nouveau plan pour ${orgIds.length} organisation(s) — "free", "pro" ou "business" :`,
    );
    if (!plan || !['free', 'pro', 'business'].includes(plan)) return;
    if (!window.confirm(`Changer le plan de ${orgIds.length} organisation(s) vers "${plan}" ?`))
      return;

    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/organizations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_plan', targetIds: orgIds, plan }),
      });
      const data = await res.json();
      if (data.failureCount > 0) {
        alert(
          `${data.failureCount} échec(s) sur ${orgIds.length}. Voir la console pour le détail.`,
        );
        console.error(
          '[bulk change_plan] failures:',
          data.results?.filter((r: any) => !r.ok),
        );
      }
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkExport(orgIds: string[]) {
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/organizations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export', targetIds: orgIds }),
      });
      const data = await res.json();
      if (data.failureCount > 0) {
        alert(
          `${data.failureCount} échec(s) sur ${orgIds.length}. Les exports réussis seront tout de même téléchargés.`,
        );
      }
      // Client-side download — the bulk route returns the combined JSON
      // inline rather than as a file (see that route's own comment on
      // why there's no single sensible Content-Disposition for a
      // multi-org result); building the downloadable file is this
      // screen's job instead.
      const blob = new Blob([JSON.stringify(data.exports ?? [], null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dala-bulk-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBulkBusy(false);
    }
  }

  async function runAction(reason: string) {
    if (!pendingAction) return;
    await fetch(`/api/admin/organizations/${pendingAction.org.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Phase 6.3 — pendingAction.action is always 'soft_delete' now (suspend
        // moved to runSuspend); kept generic to avoid a redundant cast.
        action: pendingAction.action,
        reason,
        confirmName: pendingAction.org.name,
      }),
    });
    setPendingAction(null);
    await load();
  }

  // Phase 6.3 (premium-ux-system-guide.md §9/§18) — suspend is now an
  // immediate-fire action with an undo toast, not a typed-confirmation dialog.
  // Fires the suspend API call right away (same destructive-tier payload the
  // old dialog sent, minus the user-typed reason), reloads the list, then shows
  // a toast with an "Annuler" action that calls runUnsuspend to reverse it.
  // The undo window is the toast's 8s auto-dismiss (WITH_ACTION_DURATION_MS).
  async function runSuspend(org: OrgRow) {
    let ok = false;
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suspend',
          reason: SUSPEND_REASON,
          confirmName: org.name,
        }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    await load();
    if (ok) {
      toast(`${org.name} suspendue`, {
        action: { label: 'Annuler', onClick: () => runUnsuspend(org) },
      });
    }
  }

  // Phase 6.3 — reverses a suspend fired by runSuspend. unsuspend is NOT in the
  // API's `destructive` array, so it needs no reason/confirmName; it just clears
  // suspended_at. Reloads the list so the row flips back to Active.
  async function runUnsuspend(org: OrgRow) {
    try {
      await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unsuspend' }),
      });
    } finally {
      await load();
    }
  }

  // Audit fix 3b (Option B) — no ConfirmTypingDialog here, same reasoning
  // as OrgDetail.tsx's verifyOrgAction: approving/rejecting a self-serve
  // request isn't in the destructive tier that warrants typed confirmation.
  async function runVerificationAction(
    org: OrgRow,
    action: 'verify_org' | 'reject_org_verification',
  ) {
    setBulkBusy(true);
    try {
      await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: DataTableColumn<OrgRow>[] = [
    {
      key: 'name',
      header: 'Nom',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <div className="flex items-center gap-2">
          <Avatar name={r.name} imageUrl={r.logo_signed_url ?? undefined} size={28} />
          <Link
            href={`/organizations/${r.id}`}
            className="group-hover:text-accent-700 font-semibold text-neutral-900"
          >
            {r.name}
          </Link>
        </div>
      ),
    },
    {
      key: 'trade_type',
      header: 'Type',
      render: (r) => <TypeChip tradeType={r.trade_type} />,
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan,
      render: (r) => <PlanBadge plan={r.plan} />,
    },
    {
      key: 'member_count',
      header: 'Membres',
      align: 'right',
      sortValue: (r) => r.member_count,
      render: (r) => r.member_count,
    },
    {
      // Doc 04 §4.3.3 — "storage used" is a required column on this table.
      // Reuses admin_storage_usage_by_org() (migration 0026), same RPC the
      // Storage Monitor already calls, rather than a second aggregation.
      key: 'storage_used_bytes',
      header: 'Stockage',
      align: 'right',
      sortValue: (r) => r.storage_used_bytes ?? 0,
      render: (r) => formatBytes(r.storage_used_bytes ?? 0),
    },
    {
      key: 'created_at',
      header: 'Créée le',
      sortValue: (r) => r.created_at,
      render: (r) => new Date(r.created_at).toLocaleDateString('fr-FR'),
    },
    // Audit fix 3b (Option B) — only shown in the queue view; the default
    // org listing already has 6 columns and every org there is
    // 'unverified' or 'verified' by definition (queue only ever shows
    // 'pending'), so the column would be redundant noise outside this tab.
    ...(verificationQueueOnly
      ? [
          {
            key: 'verification_requested_at',
            header: 'Demandée le',
            sortValue: (r: OrgRow) => r.verification_requested_at ?? '',
            render: (r: OrgRow) =>
              r.verification_requested_at
                ? new Date(r.verification_requested_at).toLocaleDateString('fr-FR')
                : '—',
          } satisfies DataTableColumn<OrgRow>,
        ]
      : []),
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <OrgRowActions
          org={r}
          verificationQueueOnly={verificationQueueOnly}
          canSuspend={canSuspend}
          canSoftDelete={canSoftDelete}
          bulkBusy={bulkBusy}
          onVerification={(action) => runVerificationAction(r, action)}
          onSuspend={() => runSuspend(r)}
          onPending={(action) => setPendingAction({ org: r, action })}
        />
      ),
    },
  ];

  // Phase 5.5 — picker inputs (§6.3/6.4). 'Actions' is locked: hiding the
  // row menu would strand every action. The queue-only 'Demandée le'
  // column simply appears in the picker when the queue view is on; stale
  // stored orders degrade gracefully via applyColumnState's unknown-key
  // fallback. Card view ignores columns (EntityCard), so this only
  // affects the table.
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

  function renderOrgActions(org: OrgRow) {
    return (
      <OrgRowActions
        org={org}
        verificationQueueOnly={verificationQueueOnly}
        canSuspend={canSuspend}
        canSoftDelete={canSoftDelete}
        bulkBusy={bulkBusy}
        onVerification={(action) => runVerificationAction(org, action)}
        onSuspend={() => runSuspend(org)}
        onPending={(action) => setPendingAction({ org, action })}
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
        <SearchInput onChange={handleSearchChange} placeholder="Rechercher par nom…" value={q} />
        <FilterSelect
          aria-label="Plan"
          value={planFilter}
          onChange={(event) => setPlanFilter(event.target.value)}
          options={[
            { value: 'all', label: 'Tous les plans' },
            { value: 'free', label: 'Gratuit' },
            { value: 'pro', label: 'Pro' },
            { value: 'business', label: 'Entreprise' },
          ]}
        />
        {/* Audit fix 3b (Option B) — toggles the same list between "all
            orgs" and "pending verification requests only", rather than a
            separate route/screen for what's still the same table and
            the same row actions. */}
        <ToggleChip
          pressed={verificationQueueOnly}
          onClick={() => toggleVerificationQueue(!verificationQueueOnly)}
          title="Afficher uniquement les organisations en attente de vérification."
        >
          {verificationQueueOnly ? 'Toutes les organisations' : 'File de vérification'}
        </ToggleChip>
      </FilterBar>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : viewMode === 'card' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleOrgs.map((org) => (
            <EntityCard
              key={org.id}
              href={`/organizations/${org.id}`}
              avatar={
                <Avatar name={org.name} imageUrl={org.logo_signed_url ?? undefined} size={28} />
              }
              title={org.name}
              subtitle={org.trade_type ?? 'Type non renseigné'}
              badges={<PlanBadge plan={org.plan} />}
              fields={[
                { label: 'Membres', value: org.member_count },
                { label: 'Stockage', value: formatBytes(org.storage_used_bytes ?? 0) },
                { label: 'Créée le', value: new Date(org.created_at).toLocaleDateString('fr-FR') },
              ]}
              actions={renderOrgActions(org)}
            />
          ))}
        </div>
      ) : (
        <DataTable
          columns={displayColumns}
          rows={visibleOrgs}
          getRowId={(r) => r.id}
          density={prefs.density}
          selectable
          // Phase 19B item 3 — see UsersTable.tsx's identical comment;
          // preserves Admin's pre-extraction always-reset behavior.
          resetSelectionOnRowsChange
          bulkActions={(ids) => (
            <>
              {canBulkChangePlan && (
                <button
                  onClick={() => runBulkChangePlan(ids)}
                  disabled={bulkBusy}
                  className="text-accent-700 text-xs font-medium hover:underline disabled:opacity-60"
                >
                  Changer le plan
                </button>
              )}
              <button
                onClick={() => runBulkExport(ids)}
                disabled={bulkBusy}
                className="text-accent-700 text-xs font-medium hover:underline disabled:opacity-60"
              >
                Exporter (JSON)
              </button>
            </>
          )}
          pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          emptyState={
            hasActiveFilters ? (
              <NoResultsState term={q || undefined} onClearFilters={resetFilters} />
            ) : (
              <EmptyState
                icon={BuildingsIcon}
                title="Aucune organisation"
                description="Les organisations créées par les contractants apparaîtront ici."
              />
            )
          }
        />
      )}

      {pendingAction && (
        <ConfirmTypingDialog
          // Phase 6.3 — this dialog is now soft_delete-only (suspend moved to
          // the undo-toast flow); title/label are unconditional.
          title="Supprimer l'organisation"
          description="Cette action est journalisée dans le journal d'audit. L'organisation est récupérable pendant 30 jours."
          confirmValue={pendingAction.org.name}
          confirmLabel="Supprimer"
          requireReason
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

'use client';

import {
  Button,
  ColumnPicker,
  DataTable,
  type DataTableColumn,
  DensityToggle,
  EmptyState,
  ErrorState,
  FilterSelect,
  NoResultsState,
  StatusBadge,
} from '@dala/ui-web';
import { ClipboardTextIcon } from '@phosphor-icons/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  applyColumnState,
  DEFAULT_TABLE_PREFS,
  readTablePrefs,
  writeTablePrefs,
  type TablePrefs,
} from '@/lib/table-preferences';

interface Entry {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  org_id: string | null;
  ip_address: string | null;
  impersonated_user_id: string | null;
  created_at: string;
}

// Phase 4.7 (§5 Journal-d'audit item) — the two filters with a real finite
// value space. Sourcing: `action`/`target_table` have NO DB constraint
// (0009 line 21 — free text), and audit_log's only writer in the entire
// repo is logAdminAction() (lib/audit-log.ts — confirmed by 0060/0073's own
// greps), so these lists are a hand-maintained mirror of every call site's
// literal action string + every targetTable value, as of Phase 4.7 Step 11
// (40 actions / 8 tables, confirmed complete by the user). Migration 0053's
// header documents an older 25-string list — stale by 15 actions (added by
// later remediation tiers); do NOT source from it. A new logAdminAction()
// call site must add its string to AUDIT_ACTIONS (or its targetTable to
// AUDIT_TABLES) or the filter can't express it.
const AUDIT_ACTIONS = [
  'admin.invite',
  'admin.reset_totp',
  'admin.impersonate_start',
  'admin.impersonate_end',
  'admin.login',
  'admin.logout',
  'admin.revoke_session',
  'announcement.publish',
  'announcement.schedule',
  'app_version.update',
  'billing.extend_expiry',
  'billing.manual_discount',
  'billing.mark_paid',
  'billing.cancel',
  'db_explorer.read',
  'db_explorer.write_requested',
  'db_explorer.write_executed',
  'db_explorer.write_rejected',
  'db_explorer.write_approved_and_executed',
  'feature_flag.create',
  'feature_flag.update',
  'feature_flag.delete',
  'feature_flag.override',
  'note.create',
  'note.update',
  'note.delete',
  'org.suspend',
  'org.unsuspend',
  'org.soft_delete',
  'org.change_plan',
  'org.restore',
  'org.verify_org',
  'org.reject_org_verification',
  'storage.cleanup_orphaned_files',
  'user.reset_password',
  'user.suspend',
  'user.unsuspend',
  'user.delete',
  'user.move_org',
  'user.revoke_sessions',
];

const AUDIT_TABLES = [
  'admin_approval_requests',
  'admin_sessions',
  'announcements',
  'app_versions',
  'feature_flags',
  'organizations',
  'platform_admins',
  'profiles',
];

// Leading value:'' option = the raw inputs' exact "empty = param omitted"
// fetch semantics (the route skips unset filters); "Toutes …" is its label.
const ACTION_OPTIONS = [
  { value: '', label: 'Toutes les actions' },
  ...AUDIT_ACTIONS.map((action) => ({ value: action, label: action })),
];
const TABLE_OPTIONS = [
  { value: '', label: 'Toutes les tables' },
  ...AUDIT_TABLES.map((table) => ({ value: table, label: table })),
];

// Client-side pagination (Phase 4.7 option a): the route returns ONE fetch
// capped at CAP rows — pages slice what's already here, no refetch per page.
const PAGE_SIZE = 50;
// Must match the route's .limit(200): at the cap, isCapped swaps the
// exact-looking total for the honest "200+ résultats" line.
const CAP = 200;

// Doc 04 §4.3.6 — filters across all six spec-listed dimensions: user, org,
// action, table, date (from/to), IP. org_id/ip_address only exist on
// audit_log as of migration 0052 — rows written before that migration have
// both null, so filtering on them naturally excludes pre-0052 history
// rather than silently misreporting it.
export function AuditLogTable() {
  // Phase 5.3 (premium-ux-system-guide.md §15/§18) — applied filters and
  // page live in the URL (shareable, reload-stable); GlobalSearch's
  // `?action=` deep-link (Tier 4.4) keeps working because the key name is
  // unchanged. The input values below stay LOCAL draft state — this screen
  // is click-to-apply (the Filtrer button), so the URL is written only when
  // filters are actually applied (or the page changes), never per keystroke.
  // Defaults are never serialized; sort is NOT URL-backed this step — it
  // lives inside DataTable (ui-web), which exposes no controlled sort
  // props; flagged, not silently skipped.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Draft filter inputs — local state hydrated from the URL on first mount
  // (same read-once semantics the Tier 4.4 deep-link had before 5.3), so a
  // shared `?action=…&dateFrom=…` link opens with the inputs pre-filled.
  const [actionFilter, setActionFilter] = useState(searchParams.get('action') ?? '');
  const [tableFilter, setTableFilter] = useState(searchParams.get('table') ?? '');
  const [actorIdFilter, setActorIdFilter] = useState(searchParams.get('actorId') ?? '');
  const [orgIdFilter, setOrgIdFilter] = useState(searchParams.get('orgId') ?? '');
  const [ipFilter, setIpFilter] = useState(searchParams.get('ipAddress') ?? '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? '');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as the other admin tables: no res.ok
  // check on this filtered fetch.
  const [loadError, setLoadError] = useState(false);

  // Phase 4.7 (§5 Journal-d'audit item) — client-side pagination state
  // (option a): page slices the already-fetched entries; no refetch on
  // page change. Resets with every Filtrer-triggered load (see button).
  const page = Number(searchParams.get('page')) || 1;

  // Same name/signature as the useState setter it replaces, so the
  // pagination call site below stays byte-identical.
  function setPage(next: number) {
    setParams({ page: next === 1 ? null : String(next) });
  }

  // Phase 5.4 (§7) — the choice is based on the APPLIED filters (the URL —
  // what the fetched entries actually reflect), not the draft input values,
  // and not just entries.length === 0: a typed-but-not-yet-applied draft
  // must not flip "empty audit log" into "no results". This also fixes a
  // pre-existing wrongness: the old EmptyState showed its filter message
  // even when no filter was applied.
  const hasActiveFilters = Boolean(
    searchParams.get('action') ||
    searchParams.get('table') ||
    searchParams.get('actorId') ||
    searchParams.get('orgId') ||
    searchParams.get('ipAddress') ||
    searchParams.get('dateFrom') ||
    searchParams.get('dateTo'),
  );

  function resetFilters() {
    // Clear the URL (applied filters), the draft inputs (so the form
    // reflects the reset), reset the page, and refetch — one URL write.
    setParams({
      action: null,
      table: null,
      actorId: null,
      orgId: null,
      ipAddress: null,
      dateFrom: null,
      dateTo: null,
      page: null,
    });
    setActionFilter('');
    setTableFilter('');
    setActorIdFilter('');
    setOrgIdFilter('');
    setIpFilter('');
    setDateFrom('');
    setDateTo('');
    void load();
  }

  // Phase 5.5 (§6.3/6.4, §15) — per-table column visibility/reorder +
  // density, persisted in localStorage (dala-admin-table-audit-log-prefs;
  // extends the sidebar's dala-admin-* key convention). Read on mount like
  // the sidebar (SSR-safe): first paint is the defaults, then stored prefs
  // settle in — fresh loads with no stored prefs are byte-identical (test
  // contract).
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_TABLE_PREFS);
  useEffect(() => {
    setPrefs(readTablePrefs('audit-log'));
  }, []);

  function updatePrefs(next: TablePrefs) {
    setPrefs(next);
    writeTablePrefs('audit-log', next);
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (tableFilter) params.set('table', tableFilter);
      if (actorIdFilter) params.set('actorId', actorIdFilter);
      if (orgIdFilter) params.set('orgId', orgIdFilter);
      if (ipFilter) params.set('ipAddress', ipFilter);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Intentionally runs once on mount — `load()` reads the latest filter
    // values via closure each time it's invoked from the Filtrer button,
    // so none of them need to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    // Single setParams call — all applied filters + the page-1 reset must
    // land in the same URL write (two sequential replace()s would each
    // build from the pre-navigation searchParams), then fetch with those
    // same draft values via closure.
    setParams({
      action: actionFilter,
      table: tableFilter,
      actorId: actorIdFilter,
      orgId: orgIdFilter,
      ipAddress: ipFilter,
      dateFrom,
      dateTo,
      page: null,
    });
    void load();
  }

  const columns: DataTableColumn<Entry>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortValue: (e) => e.created_at,
      render: (e) => new Date(e.created_at).toLocaleString('fr-FR'),
    },
    {
      key: 'action',
      header: 'Action',
      render: (e) => <span className="font-mono text-xs">{e.action}</span>,
    },
    {
      key: 'target',
      header: 'Cible',
      render: (e) => (e.target_table ? `${e.target_table}:${e.target_id?.slice(0, 8)}` : '—'),
    },
    {
      key: 'org',
      header: 'Org',
      render: (e) => e.org_id?.slice(0, 8) ?? '—',
    },
    { key: 'actor', header: 'Acteur', render: (e) => e.actor_id?.slice(0, 8) ?? '—' },
    {
      key: 'ip_address',
      header: 'IP',
      render: (e) => <span className="font-mono text-xs">{e.ip_address ?? '—'}</span>,
    },
    {
      key: 'impersonation',
      header: 'Impersonation',
      render: (e) =>
        e.impersonated_user_id ? (
          <StatusBadge variant="warning">{e.impersonated_user_id.slice(0, 8)}</StatusBadge>
        ) : (
          '—'
        ),
    },
  ];

  // Phase 5.5 — picker inputs (§6.3/6.4). Read-only table: no actions
  // column, nothing locked. This screen predates FilterBar adoption, so
  // the controls sit in the filter row (see the trailing group below).
  const currentOrder = prefs.order.length ? prefs.order : columns.map((c) => c.key);
  const pickerColumns = columns.map((c) => ({ key: c.key, header: c.header }));
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

  // Phase 4.7 (§5 Journal-d'audit item) — client-side pagination (option a):
  // the route returns ONE fetch capped at CAP rows, so pages slice what's
  // already here instead of refetching. True server-side paging is deferred
  // backend work (an API request/response shape change — AGENTS.md scope).
  const isCapped = entries.length >= CAP;
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        {/* Phase 5.5 (§6.3/6.4) — this screen predates FilterBar; the
            controls sit in an ml-auto trailing group of the same row until
            a surface pass converts the row to FilterBar (out of scope
            here). */}
        <div className="ml-auto flex items-center gap-2">
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
        {/* Phase 4.7 (§5 Journal-d'audit item) — was a free-text input; the
            action space is finite (40 strings, see AUDIT_ACTIONS). The
            leading value:'' option preserves the input's exact "empty =
            param omitted" fetch semantics. */}
        <FilterSelect
          aria-label="Filtrer par action"
          className="w-64"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          options={ACTION_OPTIONS}
        />
        {/* Phase 4.7 (§5 Journal-d'audit item) — was a free-text input; the
            table space is finite (8 values + null, see AUDIT_TABLES). Same
            value:'' first option, same semantics preservation. */}
        <FilterSelect
          aria-label="Filtrer par table"
          className="w-48"
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          options={TABLE_OPTIONS}
        />
        <input
          type="text"
          placeholder="ID utilisateur admin"
          value={actorIdFilter}
          onChange={(e) => setActorIdFilter(e.target.value)}
          className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 w-44 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150"
        />
        <input
          type="text"
          placeholder="ID organisation"
          value={orgIdFilter}
          onChange={(e) => setOrgIdFilter(e.target.value)}
          className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 w-44 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150"
        />
        <input
          type="text"
          placeholder="Adresse IP"
          value={ipFilter}
          onChange={(e) => setIpFilter(e.target.value)}
          className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 w-36 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150"
        />
        <label className="flex flex-col text-xs text-neutral-500">
          Du
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150"
          />
        </label>
        <label className="flex flex-col text-xs text-neutral-500">
          Au
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-control bg-neutral-0 focus:border-accent-600 h-10 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150"
          />
        </label>
        {/* Phase 4.7 — click-to-apply behavior unchanged; the page resets
            with the filters so a stale page/filter combination can't return
            an empty slice (same reasoning as InvocationLogTable). */}
        <Button variant="secondary" onClick={applyFilters}>
          Filtrer
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <>
          {/* Phase 4.7 — pagination condition 1: the route caps this fetch at
              CAP rows, so at the cap a bare "sur 200" would read as an exact
              total. This honest-count line renders at the cap; the pagination
              pill below still pages the 200-row window the UI actually has. */}
          {isCapped && (
            <p className="mb-2 text-xs text-neutral-500">200+ résultats (affinez les filtres)</p>
          )}
          <DataTable
            columns={displayColumns}
            rows={pagedEntries}
            getRowId={(e) => e.id}
            density={prefs.density}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: entries.length,
              onPageChange: setPage,
            }}
            emptyState={
              hasActiveFilters ? (
                <NoResultsState onClearFilters={resetFilters} />
              ) : (
                <EmptyState
                  icon={ClipboardTextIcon}
                  title="Aucune entrée"
                  description="Aucune action ne correspond à ce filtre."
                />
              )
            }
          />
        </>
      )}
    </div>
  );
}

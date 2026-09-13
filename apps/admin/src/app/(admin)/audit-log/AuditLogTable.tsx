'use client';

import {
  Button,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  FilterSelect,
  StatusBadge,
} from '@dala/ui-web';
import { ClipboardTextIcon } from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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
  // Admin remediation Tier 4.4 — GlobalSearch links here with `?action=`
  // to deep-link a pre-filtered view. Read once on mount, same "this
  // screen's own filter state becomes the source of truth from here on,
  // not kept in sync with the URL afterward" reasoning as UsersTable.tsx.
  const searchParams = useSearchParams();
  const initialAction = searchParams.get('action') ?? '';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as the other admin tables: no res.ok
  // check on this filtered fetch.
  const [loadError, setLoadError] = useState(false);
  const [actionFilter, setActionFilter] = useState(initialAction);
  const [tableFilter, setTableFilter] = useState('');
  const [actorIdFilter, setActorIdFilter] = useState('');
  const [orgIdFilter, setOrgIdFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Phase 4.7 (§5 Journal-d'audit item) — client-side pagination state
  // (option a): page slices the already-fetched entries; no refetch on
  // page change. Resets with every Filtrer-triggered load (see button).
  const [page, setPage] = useState(1);

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
  }, []);

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

  // Phase 4.7 (§5 Journal-d'audit item) — client-side pagination (option a):
  // the route returns ONE fetch capped at CAP rows, so pages slice what's
  // already here instead of refetching. True server-side paging is deferred
  // backend work (an API request/response shape change — AGENTS.md scope).
  const isCapped = entries.length >= CAP;
  const pagedEntries = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
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
        <Button
          variant="secondary"
          onClick={() => {
            setPage(1);
            void load();
          }}
        >
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
            columns={columns}
            rows={pagedEntries}
            getRowId={(e) => e.id}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: entries.length,
              onPageChange: setPage,
            }}
            emptyState={
              <EmptyState
                icon={ClipboardTextIcon}
                title="Aucune entrée"
                description="Aucune action ne correspond à ce filtre."
              />
            }
          />
        </>
      )}
    </div>
  );
}

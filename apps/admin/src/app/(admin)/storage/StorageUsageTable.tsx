'use client';

import type { OrgStorageUsage } from '@dala/shared-types';
import {
  Button,
  Card,
  ColumnPicker,
  DataTable,
  type DataTableColumn,
  DensityToggle,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSelect,
  NoResultsState,
  PlanBadge,
  StatStrip,
  StatusBadge,
  TableSkeleton,
} from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SearchInput } from '@/components/ui/SearchInput';
import { formatStorage } from '@/lib/format';
import {
  applyColumnState,
  DEFAULT_TABLE_PREFS,
  readTablePrefs,
  writeTablePrefs,
  type TablePrefs,
} from '@/lib/table-preferences';
import { useAdminSession } from '@/lib/use-admin-session';

// Doc 00 §0.3 item 7 — free-tier storage-overage policy, labels shown next
// to each org's usage. Only meaningful for plan === 'free'; other plans
// show "Pas de seuil défini" rather than a fabricated limit.
const OVERAGE_LABELS: Record<
  OrgStorageUsage['overage_status'],
  { label: string; variant: 'success' | 'warning' | 'warningStrong' | 'danger' | 'neutral' }
> = {
  ok: { label: 'Sous le seuil', variant: 'success' },
  warning: { label: '≥ 800 Mo — bannière/e-mail', variant: 'warning' },
  critical: { label: '≥ 950 Mo — upload mis en file', variant: 'warningStrong' },
  over_limit: { label: '≥ 1 Go — lecture seule', variant: 'danger' },
  no_limit_defined: { label: 'Pas de seuil défini', variant: 'neutral' },
};

export function StorageUsageTable() {
  // Doc 04 §4.3.8 / §4.3 intro — the cleanup action is a data-deleting
  // action, outside Support's read-only boundary.
  const { data: session } = useAdminSession();
  const canCleanup = session?.admin.role === 'super_admin' || session?.admin.role === 'admin';

  const [rows, setRows] = useState<OrgStorageUsage[]>([]);
  const [totals, setTotals] = useState<{
    totalBytes: number;
    totalFiles: number;
    orgCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Phase 4.7 (Step 9) - client-side search by org name + overage-status
  // filter (no API change; the storage GET route takes no params and the
  // full set is loaded).
  // Phase 5.3 (premium-ux-system-guide.md §15/§18) — both now round-trip
  // through the URL (shareable, reload-stable): `?status=over_limit`
  // deep-links straight to orgs needing action. Defaults are never
  // serialized, so a param-less URL behaves exactly as before.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = searchParams.get('q') ?? '';
  const rawStatus = searchParams.get('status');
  const statusFilter = ['ok', 'warning', 'critical', 'over_limit', 'no_limit_defined'].includes(
    rawStatus ?? '',
  )
    ? (rawStatus as string)
    : 'all';

  function setParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Same name/signature as the useState setter it replaces, so the
  // FilterSelect call site below stays byte-identical.
  function setStatusFilter(next: string) {
    setParams({ status: next === 'all' ? null : next });
  }

  // Phase 5.4 (§7) — "no data at all" vs "filters matched nothing" is
  // decided by whether ANY filter/search value is set, not rows.length.
  const hasActiveFilters = Boolean(q) || statusFilter !== 'all';

  function resetFilters() {
    setParams({ q: null, status: null });
  }

  // Phase 5.5 (§6.3/6.4, §15) — per-table column visibility/reorder +
  // density, persisted in localStorage (dala-admin-table-storage-prefs;
  // extends the sidebar's dala-admin-* key convention). Read on mount like
  // the sidebar (SSR-safe): first paint is the defaults, then stored prefs
  // settle in — fresh loads with no stored prefs are byte-identical (test
  // contract).
  const [prefs, setPrefs] = useState<TablePrefs>(DEFAULT_TABLE_PREFS);
  useEffect(() => {
    setPrefs(readTablePrefs('storage'));
  }, []);

  function updatePrefs(next: TablePrefs) {
    setPrefs(next);
    writeTablePrefs('storage', next);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetch('/api/admin/storage');
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue.');
      } else {
        setRows(data.rows ?? []);
        setTotals(data.totals ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function runCleanup() {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const res = await fetch('/api/admin/storage/cleanup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setCleanupResult(data.error ?? 'Erreur inconnue.');
        return;
      }
      setCleanupResult(
        `${data.deletedCount} fichier(s) orphelin(s) supprimé(s) — ${formatStorage(data.freedBytes)} libéré(s).`,
      );
      // Refresh the table so the freed storage reflects immediately.
      const refreshed = await fetch('/api/admin/storage');
      const refreshedData = await refreshed.json();
      if (refreshed.ok) {
        setRows(refreshedData.rows ?? []);
        setTotals(refreshedData.totals ?? null);
      }
    } finally {
      setCleaning(false);
    }
  }

  const columns: DataTableColumn<OrgStorageUsage>[] = [
    {
      key: 'organization_name',
      header: 'Organisation',
      sortValue: (r) => r.organization_name.toLowerCase(),
      render: (r) => (
        <Link
          href={`/organizations/${r.organization_id}`}
          className="group-hover:text-accent-700 font-semibold text-neutral-900"
        >
          {r.organization_name}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan ?? '',
      render: (r) => (r.plan ? <PlanBadge plan={r.plan} /> : '—'),
    },
    {
      key: 'file_count',
      header: 'Fichiers',
      align: 'right',
      sortValue: (r) => r.file_count,
      render: (r) => r.file_count.toLocaleString('fr-FR'),
    },
    {
      key: 'total_bytes',
      header: 'Stockage utilisé',
      align: 'right',
      sortValue: (r) => r.total_bytes,
      render: (r) => formatStorage(r.total_bytes),
    },
    {
      key: 'org_status',
      header: 'Statut',
      render: (r) =>
        r.deleted_at ? (
          <StatusBadge variant="danger">Supprimée</StatusBadge>
        ) : r.suspended_at ? (
          <StatusBadge variant="warning">Suspendue</StatusBadge>
        ) : (
          <StatusBadge variant="success">Active</StatusBadge>
        ),
    },
    {
      key: 'overage_status',
      header: 'Quota',
      render: (r) => {
        const cfg = OVERAGE_LABELS[r.overage_status];
        return <StatusBadge variant={cfg.variant}>{cfg.label}</StatusBadge>;
      },
    },
  ];

  // Phase 5.5 — picker inputs (§6.3/6.4). No locked column: this table has
  // no row-actions column (cleanup lives in FilterBar's trailing slot).
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

  if (error) {
    return (
      <Card className="mt-6 p-8">
        <ErrorState description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </Card>
    );
  }

  // Phase 5 (§5.9) — one-off "Chargement…" paragraph → TableSkeleton, the
  // same loading treatment OrganizationsTable/UsersTable/BillingTable use.
  if (loading) {
    return (
      <div className="mt-6">
        <TableSkeleton />
      </div>
    );
  }

  function handleSearchChange(value: string) {
    setParams({ q: value });
  }

  const visibleRows = rows.filter((r) => {
    if (statusFilter !== 'all' && r.overage_status !== statusFilter) return false;
    if (q && !r.organization_name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mt-6">
      {totals && (
        <div className="mb-3">
          <StatStrip
            items={[
              { label: 'Organisations', value: totals.orgCount },
              { label: 'Fichiers', value: totals.totalFiles.toLocaleString('fr-FR') },
              { label: 'Stockage total', value: formatStorage(totals.totalBytes) },
            ]}
          />
        </div>
      )}
      <FilterBar
        trailing={
          <div className="flex items-center gap-3">
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
            {canCleanup && (
              <div className="flex items-center gap-3">
                {cleanupResult && <p className="text-xs text-neutral-500">{cleanupResult}</p>}
                <Button variant="secondary" onClick={runCleanup} disabled={cleaning}>
                  {cleaning ? 'Nettoyage…' : 'Nettoyer les fichiers orphelins'}
                </Button>
              </div>
            )}
          </div>
        }
      >
        <SearchInput
          onChange={handleSearchChange}
          placeholder="Rechercher par nom d'organisation…"
          value={q}
        />
        <FilterSelect
          aria-label="Quota"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: 'all', label: 'Tous les statuts' },
            { value: 'ok', label: 'Sous le seuil' },
            { value: 'warning', label: '≥ 800 Mo — bannière/e-mail' },
            { value: 'critical', label: '≥ 950 Mo — upload mis en file' },
            { value: 'over_limit', label: '≥ 1 Go — lecture seule' },
            { value: 'no_limit_defined', label: 'Pas de seuil défini' },
          ]}
        />
      </FilterBar>
      <DataTable
        columns={displayColumns}
        rows={visibleRows}
        getRowId={(r) => r.organization_id}
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

'use client';

import {
  Avatar,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  EntityCard,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSelect,
  IconActionButton,
  PlanBadge,
  TableSkeleton,
  ToggleChip,
  TypeChip,
  ViewToggle,
} from '@dala/ui-web';
import {
  BuildingsIcon,
  CheckIcon,
  DownloadSimpleIcon,
  PauseCircleIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SearchInput } from '@/components/ui/SearchInput';
import { useAdminSession } from '@/lib/use-admin-session';

const PAGE_SIZE = 50;

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

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — this fetch had no error handling at all: a
  // failed response wasn't checked (`res.ok`), so a server error or
  // network failure either threw uncaught from `res.json()` on a
  // non-JSON body (leaving `loading` stuck true forever, no retry) or
  // silently rendered "Aucune organisation," indistinguishable from a
  // genuinely empty result.
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  // Audit fix 3b (Option B) — the admin approval queue tab. A plain
  // client-side toggle on top of the existing search/pagination state,
  // same shape as `q` — flips ?verificationPending=1 on the list route
  // rather than a separate screen for what's still the same table.
  const [verificationQueueOnly, setVerificationQueueOnly] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    org: OrgRow;
    action: 'suspend' | 'soft_delete';
  } | null>(null);

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
    setVerificationQueueOnly(value);
    setPage(1); // same "any filter change resets to page 1" convention as handleSearchChange.
  }

  function handleSearchChange(value: string) {
    setQ(value);
    setPage(1); // Tier 4.1's own pattern: any filter change resets to page 1.
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
        action: pendingAction.action,
        reason,
        confirmName: pendingAction.org.name,
      }),
    });
    setPendingAction(null);
    await load();
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
        <div className="flex justify-end gap-2">
          {verificationQueueOnly && canSuspend && (
            <>
              <IconActionButton
                icon={CheckIcon}
                label="Approuver"
                tone="success"
                onClick={() => runVerificationAction(r, 'verify_org')}
                disabled={bulkBusy}
              ></IconActionButton>
              <IconActionButton
                icon={XIcon}
                label="Refuser"
                tone="danger"
                onClick={() => runVerificationAction(r, 'reject_org_verification')}
                disabled={bulkBusy}
              ></IconActionButton>
            </>
          )}
          {canSuspend && (
            <IconActionButton
              icon={PauseCircleIcon}
              label="Suspendre"
              tone="warning"
              onClick={() => setPendingAction({ org: r, action: 'suspend' })}
            />
          )}
          {canSoftDelete && (
            <IconActionButton
              icon={TrashIcon}
              label="Supprimer"
              tone="danger"
              onClick={() => setPendingAction({ org: r, action: 'soft_delete' })}
            />
          )}
          <IconActionButton
            icon={DownloadSimpleIcon}
            label="Exporter"
            tone="neutral"
            href={`/api/admin/organizations/${r.id}/export?format=json`}
          />
        </div>
      ),
    },
  ];

  function renderOrgActions(org: OrgRow) {
    return (
      <>
        {verificationQueueOnly && canSuspend && (
          <>
            <IconActionButton
              icon={CheckIcon}
              label="Approuver"
              tone="success"
              onClick={() => runVerificationAction(org, 'verify_org')}
              disabled={bulkBusy}
            />
            <IconActionButton
              icon={XIcon}
              label="Refuser"
              tone="danger"
              onClick={() => runVerificationAction(org, 'reject_org_verification')}
              disabled={bulkBusy}
            />
          </>
        )}
        {canSuspend && (
          <IconActionButton
            icon={PauseCircleIcon}
            label="Suspendre"
            tone="warning"
            onClick={() => setPendingAction({ org, action: 'suspend' })}
          />
        )}
        {canSoftDelete && (
          <IconActionButton
            icon={TrashIcon}
            label="Supprimer"
            tone="danger"
            onClick={() => setPendingAction({ org, action: 'soft_delete' })}
          />
        )}
        <IconActionButton
          icon={DownloadSimpleIcon}
          label="Exporter"
          tone="neutral"
          href={`/api/admin/organizations/${org.id}/export?format=json`}
        />
      </>
    );
  }

  return (
    <>
      <FilterBar trailing={<ViewToggle value={viewMode} onChange={setViewMode} />}>
        <SearchInput onChange={handleSearchChange} placeholder="Rechercher par nom…" />
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
          columns={columns}
          rows={visibleOrgs}
          getRowId={(r) => r.id}
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
            <EmptyState
              icon={BuildingsIcon}
              title="Aucune organisation"
              description={
                q
                  ? 'Aucune organisation ne correspond à cette recherche.'
                  : 'Les organisations créées par les contractants apparaîtront ici.'
              }
            />
          }
        />
      )}

      {pendingAction && (
        <ConfirmTypingDialog
          title={
            pendingAction.action === 'suspend'
              ? "Suspendre l'organisation"
              : "Supprimer l'organisation"
          }
          description="Cette action est journalisée dans le journal d'audit. Le compte est bloqué (suspension) ou récupérable pendant 30 jours (suppression)."
          confirmValue={pendingAction.org.name}
          confirmLabel={pendingAction.action === 'suspend' ? 'Suspendre' : 'Supprimer'}
          requireReason
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

'use client';

import {
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  ErrorState,
  StatusBadge,
} from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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

  const columns: DataTableColumn<SubscriptionRow>[] = [
    {
      key: 'orgName',
      header: 'Organisation',
      sortValue: (r) => r.orgName.toLowerCase(),
      render: (r) => (
        <Link
          href={`/organizations/${r.orgId}`}
          className="text-accent-600 font-medium hover:underline"
        >
          {r.orgName}
        </Link>
      ),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortValue: (r) => r.plan,
      render: (r) => <StatusBadge variant="info">{r.plan}</StatusBadge>,
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
              <div className="flex justify-end gap-2">
                <button
                  disabled={busyOrgId === r.orgId}
                  onClick={() => runAction(r, 'extend_expiry')}
                  className="text-accent-600 text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Prolonger
                </button>
                <button
                  disabled={busyOrgId === r.orgId}
                  onClick={() => runAction(r, 'manual_discount')}
                  className="text-accent-600 text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Remise
                </button>
                <button
                  disabled={busyOrgId === r.orgId}
                  onClick={() => runAction(r, 'mark_paid')}
                  className="text-accent-600 text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Payé hors Konnect
                </button>
                <button
                  disabled={busyOrgId === r.orgId}
                  onClick={() => runAction(r, 'cancel')}
                  className="text-danger text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  if (error) {
    return (
      <Card className="mt-6 p-8">
        <ErrorState description={error} onRetry={() => void load()} />
      </Card>
    );
  }

  if (loading) {
    return <p className="mt-6 text-sm text-neutral-500">Chargement…</p>;
  }

  return (
    <div className="mt-6">
      <p className="mb-3 text-sm text-neutral-500">
        MRR : <span className="font-medium text-neutral-900">{formatTnd(mrrMillimes)}</span>
        {distribution.length > 0 && (
          <>
            {' '}
            · Répartition des plans :{' '}
            {distribution.map((d) => `${d.plan} (${d.count})`).join(' · ')}
          </>
        )}
      </p>
      <DataTable
        columns={columns}
        rows={subscriptions}
        getRowId={(r) => r.orgId}
        emptyState={
          <EmptyState
            icon={BuildingsIcon}
            title="Aucune organisation"
            description="Pas encore d'organisations dans cet environnement."
          />
        }
      />
    </div>
  );
}

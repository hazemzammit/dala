'use client';

import {
  DataTable,
  type DataTableColumn,
  ErrorState,
  StatusBadge,
  TableSkeleton,
} from '@dala/ui-web';
import { useEffect, useState } from 'react';

interface EmailEvent {
  id: string;
  resend_email_id: string;
  event_type: 'email.bounced' | 'email.complained';
  recipient: string;
  bounce_type: string | null;
  bounce_message: string | null;
  received_at: string;
}

const EVENT_LABELS: Record<EmailEvent['event_type'], string> = {
  'email.bounced': 'Rebond',
  'email.complained': 'Plainte (spam)',
};

/**
 * apps/admin/src/app/(admin)/services-health/EmailDeliverabilityTable.tsx
 *
 * Admin remediation Tier 4.7. Bounces/complaints only (see the route's
 * own header for why delivered/opened/clicked aren't shown here) — no
 * pagination given the plan's own "delivered events are just noise at
 * this scale" framing implies bounces/complaints stay low-volume too;
 * RESULTS_LIMIT (100) on the route is the practical cap.
 */
export function EmailDeliverabilityTable() {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as this route's other two tables: no
  // res.ok check, so a failed fetch previously rendered identically to
  // "no bounces/complaints yet."
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/services-health/email-events')
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const columns: DataTableColumn<EmailEvent>[] = [
    {
      key: 'received_at',
      header: 'Date',
      sortValue: (e) => e.received_at,
      render: (e) => new Date(e.received_at).toLocaleString('fr-FR'),
    },
    {
      key: 'event_type',
      header: 'Type',
      render: (e) => (
        <StatusBadge variant={e.event_type === 'email.complained' ? 'danger' : 'warning'}>
          {EVENT_LABELS[e.event_type]}
        </StatusBadge>
      ),
    },
    { key: 'recipient', header: 'Destinataire', render: (e) => e.recipient },
    {
      key: 'bounce_type',
      header: 'Détail',
      render: (e) => (
        <span className="text-xs text-neutral-500">
          {e.bounce_type ? `${e.bounce_type} — ${e.bounce_message ?? ''}` : '—'}
        </span>
      ),
    },
  ];

  // Phase 5 (§5.10) — same loading treatment as Billing/Storage/Users.
  if (loading) return <TableSkeleton />;
  if (loadError) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;

  if (events.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Aucun rebond ni plainte enregistré. (Nécessite que le webhook Resend soit configuré — voir
        supabase/functions/resend-webhook.)
      </p>
    );
  }

  return <DataTable columns={columns} rows={events} getRowId={(e) => e.id} />;
}

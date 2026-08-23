'use client';

import { useEffect, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

  useEffect(() => {
    fetch('/api/admin/services-health/email-events')
      .then((res) => res.json())
      .then((data) => setEvents(data.events ?? []))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

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

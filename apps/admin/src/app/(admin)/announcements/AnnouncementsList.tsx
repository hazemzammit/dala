'use client';

import type { Announcement } from '@dala/shared-types';
import { MegaphoneIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function AnnouncementsList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/announcements')
      .then((res) => res.json())
      .then((data) => setItems(data.announcements ?? []))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const columns: DataTableColumn<Announcement>[] = [
    {
      key: 'message',
      header: 'Message',
      render: (a) => <span className="line-clamp-1 max-w-md">{a.message}</span>,
    },
    { key: 'channels', header: 'Canaux', render: (a) => a.channels.join(', ') },
    {
      key: 'estimate',
      header: 'Destinataires estimés',
      align: 'right',
      render: (a) => a.estimated_recipient_count ?? '—',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (a) =>
        a.published_at ? (
          <StatusBadge variant="success">Publiée</StatusBadge>
        ) : a.scheduled_for ? (
          <StatusBadge variant="info">
            {`Programmée · ${new Date(a.scheduled_for).toLocaleString('fr-FR')}`}
          </StatusBadge>
        ) : (
          <StatusBadge variant="neutral">—</StatusBadge>
        ),
    },
    {
      key: 'delivery',
      header: 'Livraison',
      render: (a) => {
        // Doc 06 §6.3 — real signal from send-announcement-notifications
        // (migration 0030), not authoring intent. 'push' channel only; an
        // in_app-only or email-only announcement is marked delivered
        // immediately since there's nothing this job sends for it (see
        // that Edge Function's header).
        if (!a.published_at) return <span className="text-neutral-500">—</span>;
        if (!a.delivered_at) {
          return <StatusBadge variant="warning">En cours (push)</StatusBadge>;
        }
        return a.channels.includes('push') ? (
          <StatusBadge variant="success">Push envoyé</StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Aucun push à envoyer</StatusBadge>
        );
      },
    },
  ];

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <DataTable
      columns={columns}
      rows={items}
      getRowId={(a) => a.id}
      emptyState={
        <EmptyState
          icon={MegaphoneIcon}
          title="Aucune annonce"
          description="Vos annonces publiées ou programmées apparaîtront ici."
        />
      }
    />
  );
}

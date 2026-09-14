'use client';

import type { InvitationStatus, Worker } from '@dala/shared-types';
import { Button, Card, DetailHeader, StatusBadge } from '@dala/ui-web';
import { HardHatIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { WorkerFormModal } from '../WorkerFormModal';

/**
 * Worker detail (web consistency plan §2.9) — the inline detail card from
 * TeamView, promoted to an addressable page under a DetailHeader. Mirrors
 * the §2.8 ProjectDetail decision: the three metrics the inline card
 * fabricated from the row's array index (attendance / currentProject /
 * salaryAdvance) are NOT shipped here — see the FLAGGED note on the cards
 * below for where their real sources live (Step 12c of the plan).
 */
export function WorkerDetail({
  worker,
  invitationStatus,
}: {
  worker: Worker;
  invitationStatus: InvitationStatus | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const profession = worker.trade ?? 'Main-d’œuvre générale';

  const status = worker.user_id ? (
    <StatusBadge variant="success">Actif</StatusBadge>
  ) : invitationStatus === 'pending' ? (
    <StatusBadge variant="warning">Invitation envoyée</StatusBadge>
  ) : invitationStatus === 'expired' ? (
    <StatusBadge variant="neutral">Invitation expirée</StatusBadge>
  ) : (
    <StatusBadge variant="neutral">Aucune invitation</StatusBadge>
  );

  return (
    <div className="p-8">
      <DetailHeader
        backHref="/team"
        backLabel="Équipe"
        icon={HardHatIcon}
        // photo_url is a storage path, never a direct URL (migration 0070 /
        // Doc 01 §1.3.11) — the initials circle is the correct fallback.
        title={worker.full_name}
        status={status}
        meta={[
          { label: 'Profession', value: profession },
          { label: 'Téléphone', value: worker.phone ?? 'Non renseigné' },
          { label: 'Email', value: worker.email ?? 'Non renseigné' },
          {
            label: 'Taux journalier',
            value: worker.daily_rate != null ? `${worker.daily_rate} TND` : '—',
          },
        ]}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon size={16} className="me-1.5 inline" />
            Modifier l’ouvrier
          </Button>
        }
      />

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {/* FLAGGED FOR HAZEM (plan Step 12c): currentProject has no real
            source wired yet (dispatch_assignments/0035 or
            project_workers/0034). Rendered as — rather than re-shipping
            the inline card's index-fabricated value. */}
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Chantier actuel</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">—</p>
        </Card>
        {/* FLAGGED FOR HAZEM (plan Step 12c): attendance comes from
            attendance_effective (0036); no join wired yet. */}
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Présence</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">—</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Taux journalier</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
            {worker.daily_rate != null ? `${worker.daily_rate} TND` : '—'}
          </p>
        </Card>
        {/* FLAGGED FOR HAZEM (plan Step 12c): salaryAdvance comes from the
            payroll RPCs (0019); no join wired yet. */}
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Avance</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">—</p>
        </Card>
      </div>

      {editOpen && <WorkerFormModal worker={worker} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

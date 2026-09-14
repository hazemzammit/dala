'use client';

import type { InvitationStatus, Worker } from '@dala/shared-types';
import { Button, Card, DetailHeader, StatusBadge } from '@dala/ui-web';
import { HardHatIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { WorkerFormModal } from '../WorkerFormModal';

import { ProgressBar } from '@/components/contractor/Screen';

/**
 * Worker detail (web consistency plan §2.9) — the inline detail card from
 * TeamView, promoted to an addressable page under a DetailHeader. The three
 * payroll cards read the same real sources as the list (plan Step 12c —
 * queries live in [workerId]/page.tsx): attendance from attendance_effective
 * (0036) over the Monday-start cycle, the current project from the latest
 * dispatch_assignments row (0035, 30-day window), and the approved-advances
 * balance (0019).
 */
export function WorkerDetail({
  worker,
  invitationStatus,
  attendance,
  currentProject,
  salaryAdvance,
}: {
  worker: Worker;
  invitationStatus: InvitationStatus | null;
  attendance: number;
  currentProject: string;
  salaryAdvance: number;
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
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Chantier actuel</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
            {currentProject}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Présence</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">{attendance}%</p>
          <div className="mt-2">
            <ProgressBar value={attendance} tone={attendance > 85 ? 'success' : 'accent'} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Taux journalier</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
            {worker.daily_rate != null ? `${worker.daily_rate} TND` : '—'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Avance</p>
          <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
            {salaryAdvance.toLocaleString('fr-TN')} TND
          </p>
        </Card>
      </div>

      {editOpen && <WorkerFormModal worker={worker} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

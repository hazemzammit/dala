'use client';

import type { InvitationStatus, Worker } from '@dala/shared-types';
import { Button, Card, DetailHeader, StatusBadge } from '@dala/ui-web';
import { CameraIcon, HardHatIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { ProgressBar } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

import { updateWorkerPhoto } from '../actions';
import { WorkerFormModal } from '../WorkerFormModal';


/**
 * Worker detail (web consistency plan §2.9) — the inline detail card from
 * TeamView, promoted to an addressable page under a DetailHeader. The three
 * payroll cards read the same real sources as the list (plan Step 12c —
 * queries live in [workerId]/page.tsx): attendance from attendance_effective
 * (0036) over the Monday-start cycle, the current project from the latest
 * dispatch_assignments row (0035, 30-day window), and the approved-advances
 * balance (0019).
 *
 * Field-coverage pass — three real DB columns had no web equivalent at all
 * (mobile's worker/[id].tsx has had all three since migration 0070/0075):
 * `photo_url` now feeds DetailHeader's `avatarUrl` (the "no direct URL, use
 * the initials fallback" comment that used to sit here explained why it was
 * skipped, not why it should stay skipped — the signed-URL resolution lives
 * in [workerId]/page.tsx, same pattern as safety/journal/projects), plus a
 * standalone "Changer la photo" control below the header (a direct
 * `workers.photo_url` update, same shape as mobile's own upload path —
 * deliberately not part of WorkerFormModal, matching the invite-schema
 * comment's own guidance that these fields are "set later from the worker
 * detail screen instead"). `job_title`/`hire_date` (migration 0075) are now
 * in the meta row and editable from WorkerFormModal in edit mode only
 * (never shown during invite, same reasoning).
 */
export function WorkerDetail({
  worker,
  invitationStatus,
  attendance,
  currentProject,
  salaryAdvance,
  activeOrgId,
  showMoney = true,
}: {
  worker: Worker & { signed_photo_url: string | null };
  invitationStatus: InvitationStatus | null;
  attendance: number;
  currentProject: string;
  salaryAdvance: number;
  activeOrgId: string;
  /** False for viewers (money-blind, 0103): hides the daily rate and advance. */
  showMoney?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(worker.signed_photo_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Veuillez sélectionner une image valide.');
      return;
    }
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const filename = `${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
      const storagePath = `${activeOrgId}/workers/${filename}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setPhotoError("Impossible d'envoyer la photo.");
        return;
      }
      const result = await updateWorkerPhoto(worker.id, storagePath);
      if (!result.success) {
        setPhotoError(result.error);
        return;
      }
      setPhotoUrl(URL.createObjectURL(file));
    } catch {
      setPhotoError("Impossible d'envoyer la photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="p-8">
      <DetailHeader
        backHref="/team"
        backLabel="Équipe"
        icon={HardHatIcon}
        avatarUrl={photoUrl}
        title={worker.full_name}
        status={status}
        meta={[
          { label: 'Profession', value: profession },
          { label: 'Poste', value: worker.job_title ?? 'Non renseigné' },
          { label: 'Téléphone', value: worker.phone ?? 'Non renseigné' },
          { label: 'Email', value: worker.email ?? 'Non renseigné' },
          {
            label: 'Embauché le',
            value: worker.hire_date
              ? new Date(worker.hire_date).toLocaleDateString('fr-TN')
              : 'Non renseigné',
          },
          ...(showMoney
            ? [
                {
                  label: 'Taux journalier',
                  value: worker.daily_rate != null ? `${worker.daily_rate} TND` : '—',
                },
              ]
            : []),
        ]}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon size={16} className="me-1.5 inline" />
            Modifier l’ouvrier
          </Button>
        }
      />

      <div className="mt-3 flex items-center gap-2">
        <label className="text-accent-600 flex cursor-pointer items-center gap-1.5 text-sm font-medium">
          <CameraIcon size={16} />
          {uploadingPhoto ? 'Envoi en cours…' : 'Changer la photo'}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void handlePhotoChange(e)}
            disabled={uploadingPhoto}
            className="hidden"
          />
        </label>
        {photoError && <span className="text-danger text-sm">{photoError}</span>}
      </div>

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
        {showMoney && (
          <>
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
          </>
        )}
      </div>

      {editOpen && <WorkerFormModal worker={worker} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

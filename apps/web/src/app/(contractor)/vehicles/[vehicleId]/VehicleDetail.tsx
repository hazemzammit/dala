'use client';

import type { Vehicle, VehicleDocument, VehicleMaintenanceLogEntry, VehicleStatus } from '@dala/shared-types';
import { Button, Card, DetailHeader, FormField, StatusBadge } from '@dala/ui-web';
import { CameraIcon, CarIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { ProgressBar } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

import { createMaintenanceLogEntry, createVehicleDocument, updateVehiclePhoto } from '../actions';
import { VehicleFormModal } from '../VehicleFormModal';


/**
 * Vehicle detail (web consistency plan §2.9), field-coverage pass.
 *
 * Three things fixed here:
 * 1. `photo_url` (migration 0070) now feeds DetailHeader's avatarUrl, plus
 *    a standalone upload control — same "own control, own action" shape
 *    as WorkerDetail.tsx's updateWorkerPhoto, not folded into the edit form.
 * 2. The "FLAGGED FOR HAZEM (Step 12b)" maintenance placeholders are
 *    resolved for the part of that flag that was actually unambiguous:
 *    showing the single latest `vehicle_maintenance_log` row's own
 *    cost/description needs no aggregation decision (that's the vehicle
 *    LIST's separate, still-unresolved-until-decided question — the list's
 *    fabricated columns were removed outright rather than guessing at an
 *    aggregation). A small inline form adds new log entries (append-only,
 *    migration 0073 — no edit/delete of past entries).
 * 3. New "Documents" section: `vehicle_documents` (migration 0073), deduped
 *    to the latest row per `document_type` (done server-side in
 *    page.tsx), with the same due-soon badge/progress mapping mobile's
 *    vehicle/[id].tsx already uses (30-day window, this file's own
 *    judgment call per that file's header comment — not a literal spec).
 */

const STATUS_LABEL: Record<VehicleStatus, string> = {
  available: 'Disponible',
  in_use: 'En service',
  maintenance: 'Maintenance',
};

const STATUS_VARIANT: Record<VehicleStatus, 'success' | 'info' | 'warning'> = {
  available: 'success',
  in_use: 'info',
  maintenance: 'warning',
};

const DOCUMENT_TYPE_OPTIONS = ['Carte grise', 'Contrôle technique', 'Assurance', 'Vignette'];
const DUE_SOON_WINDOW_DAYS = 30;

function expiryProgressPercent(expiresAt: string): number {
  const daysRemaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  return Math.max(0, ((DUE_SOON_WINDOW_DAYS - daysRemaining) / DUE_SOON_WINDOW_DAYS) * 100);
}

function daysRemainingLabel(expiresAt: string): {
  label: string;
  variant: 'success' | 'warning' | 'danger';
} {
  const daysRemaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (daysRemaining < 0) return { label: 'Expiré', variant: 'danger' };
  if (daysRemaining <= DUE_SOON_WINDOW_DAYS)
    return { label: `Expire dans ${daysRemaining} j`, variant: 'warning' };
  return { label: 'Valide', variant: 'success' };
}

export function VehicleDetail({
  vehicle,
  latestMaintenanceEntry,
  documents,
  signedUrlByDocId,
  activeOrgId,
  showMoney = true,
}: {
  vehicle: Vehicle & { signed_photo_url: string | null };
  latestMaintenanceEntry: VehicleMaintenanceLogEntry | null;
  documents: VehicleDocument[];
  signedUrlByDocId: Record<string, string | null>;
  activeOrgId: string;
  /** False for viewers (money-blind, 0107): hides maintenance cost/history. */
  showMoney?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(vehicle.signed_photo_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logDescription, setLogDescription] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logError, setLogError] = useState<string | null>(null);
  const [logPending, setLogPending] = useState(false);

  const [docOpen, setDocOpen] = useState(false);
  const [docType, setDocType] = useState(DOCUMENT_TYPE_OPTIONS[0]!);
  const [docExpiresAt, setDocExpiresAt] = useState('');
  const [docPath, setDocPath] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docPending, setDocPending] = useState(false);

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
      const storagePath = `${activeOrgId}/vehicles/${filename}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setPhotoError("Impossible d'envoyer la photo.");
        return;
      }
      const result = await updateVehiclePhoto(vehicle.id, storagePath);
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

  async function handleSaveLog(e: React.FormEvent) {
    e.preventDefault();
    setLogError(null);
    if (!logDescription.trim()) {
      setLogError('La description est requise.');
      return;
    }
    setLogPending(true);
    const result = await createMaintenanceLogEntry({
      vehicle_id: vehicle.id,
      log_date: logDate,
      description: logDescription,
      cost: logCost ? Number(logCost) : undefined,
    });
    setLogPending(false);
    if (!result.success) {
      setLogError(result.error);
      return;
    }
    setLogOpen(false);
    window.location.reload();
  }

  async function handleDocFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setDocError(null);
    setDocUploading(true);
    try {
      const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const storagePath = `${activeOrgId}/vehicle-documents/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setDocError("Impossible d'envoyer le fichier.");
        return;
      }
      setDocPath(storagePath);
    } catch {
      setDocError("Impossible d'envoyer le fichier.");
    } finally {
      setDocUploading(false);
    }
  }

  async function handleSaveDoc(e: React.FormEvent) {
    e.preventDefault();
    setDocError(null);
    if (!docExpiresAt) {
      setDocError("La date d'expiration est requise.");
      return;
    }
    setDocPending(true);
    const result = await createVehicleDocument({
      vehicle_id: vehicle.id,
      document_type: docType,
      document_url: docPath || undefined,
      expires_at: docExpiresAt,
    });
    setDocPending(false);
    if (!result.success) {
      setDocError(result.error);
      return;
    }
    setDocOpen(false);
    window.location.reload();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <DetailHeader
        backHref="/vehicles"
        backLabel="Véhicules"
        icon={CarIcon}
        avatarUrl={photoUrl}
        title={vehicle.name}
        status={
          <StatusBadge variant={STATUS_VARIANT[vehicle.status]}>
            {STATUS_LABEL[vehicle.status]}
          </StatusBadge>
        }
        meta={[
          { label: 'Immatriculation', value: vehicle.plate ?? 'Non renseignée' },
          { label: 'Capacité', value: `${vehicle.capacity} ouvriers` },
        ]}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon size={16} className="me-1.5 inline" />
            Modifier le véhicule
          </Button>
        }
      />

      <div className="flex items-center gap-2">
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

      <Card raised className="p-6">
        <div className="flex items-center justify-between">
          {showMoney && (
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
              Maintenance
            </p>
        )}
          <button
            onClick={() => setLogOpen(true)}
            className="text-accent-600 flex items-center gap-1 text-sm font-medium"
          >
            <PlusIcon size={14} /> Ajouter une entrée
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <p className="text-xs text-neutral-500">Coût / dernier relevé</p>
            <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
              {latestMaintenanceEntry?.cost != null ? `${latestMaintenanceEntry.cost} TND` : '—'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-neutral-500">Dernière intervention</p>
            <p className="font-display mt-1 text-xl font-semibold text-neutral-900">
              {latestMaintenanceEntry?.description ?? '—'}
            </p>
            {latestMaintenanceEntry && (
              <p className="mt-0.5 text-xs text-neutral-500">
                {new Date(latestMaintenanceEntry.log_date).toLocaleDateString('fr-TN')}
              </p>
            )}
          </Card>
        </div>

        {logOpen && (
          <form
            onSubmit={(e) => void handleSaveLog(e)}
            className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <FormField
                label="Date"
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
              <FormField
                label="Description"
                value={logDescription}
                onChange={(e) => setLogDescription(e.target.value)}
                placeholder="Ex. Vidange"
                required
              />
              <FormField
                label="Coût (TND)"
                type="number"
                min={0}
                value={logCost}
                onChange={(e) => setLogCost(e.target.value)}
              />
            </div>
            {logError && <p className="text-danger text-sm">{logError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setLogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={logPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card raised className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
            Documents
          </p>
          <button
            onClick={() => setDocOpen(true)}
            className="text-accent-600 flex items-center gap-1 text-sm font-medium"
          >
            <PlusIcon size={14} /> Ajouter un document
          </button>
        </div>

        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">Aucun document enregistré.</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {documents.map((doc) => {
              const remaining = daysRemainingLabel(doc.expires_at);
              const signedUrl = signedUrlByDocId[doc.id];
              return (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-neutral-900">{doc.document_type}</p>
                    <StatusBadge variant={remaining.variant}>{remaining.label}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    Expire le {new Date(doc.expires_at).toLocaleDateString('fr-TN')}
                  </p>
                  <div className="mt-2">
                    <ProgressBar
                      value={expiryProgressPercent(doc.expires_at)}
                      tone={remaining.variant === 'danger' ? 'danger' : remaining.variant === 'warning' ? 'warning' : 'success'}
                    />
                  </div>
                  {signedUrl && (
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-600 mt-2 inline-block text-xs font-medium"
                    >
                      Voir le fichier
                    </a>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {docOpen && (
          <form
            onSubmit={(e) => void handleSaveDoc(e)}
            className="mt-4 flex flex-col gap-3 border-t border-neutral-100 pt-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-900">Type de document</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
                >
                  {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                label="Date d'expiration"
                type="date"
                value={docExpiresAt}
                onChange={(e) => setDocExpiresAt(e.target.value)}
                required
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-900">Fichier</label>
                <label className="rounded-control flex cursor-pointer items-center justify-center border border-dashed border-neutral-300 px-3 py-2.5 text-sm text-neutral-500 hover:border-neutral-400">
                  {docUploading ? 'Envoi…' : docPath ? 'Fichier envoyé ✓' : 'Choisir un fichier'}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => void handleDocFileChange(e)}
                    disabled={docUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            {docError && <p className="text-danger text-sm">{docError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDocOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={docPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </Card>

      {editOpen && <VehicleFormModal vehicle={vehicle} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

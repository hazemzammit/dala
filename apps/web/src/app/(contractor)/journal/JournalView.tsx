'use client';

import type { Project, SiteLog } from '@dala/shared-types';
import {
  CameraIcon,
  ClockIcon,
  ImageIcon,
  MicrophoneIcon,
  NotePencilIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import imageCompression from 'browser-image-compression';
import { useState, useTransition } from 'react';

import { createSiteLog } from './actions';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { createClient } from '@/lib/supabase/client';

export type SiteLogWithSignedUrl = SiteLog & { signed_photo_url: string | null };
export type ProjectOption = Pick<Project, 'id' | 'name'>;

interface JournalViewProps {
  orgId: string;
  projects: ProjectOption[];
  siteLogs: SiteLogWithSignedUrl[];
}

export function JournalView({ orgId, projects, siteLogs }: JournalViewProps) {
  const [modalMode, setModalMode] = useState<'closed' | 'photo' | 'note'>('closed');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? '');
  const [caption, setCaption] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal(mode: 'photo' | 'note') {
    setModalMode(mode);
    setError(null);
    setCaption('');
    setSelectedFile(null);
    setFilePreview(null);
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0]!.id);
    }
  }

  function closeModal() {
    setModalMode('closed');
    setError(null);
    setSelectedFile(null);
    setFilePreview(null);
    setCaption('');
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setFilePreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner un fichier image valide.');
      return;
    }

    setError(null);
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedProjectId) {
      setError('Veuillez sélectionner un projet.');
      return;
    }

    if (!selectedFile) {
      setError('Veuillez sélectionner une photo.');
      return;
    }

    startTransition(async () => {
      try {
        // Compression côté client selon l'exigence du cahier des charges
        const options = {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(selectedFile, options);

        // Limitation: Le bucket RLS impose un chemin commençant par "<org_id>/..."
        // Format: <org_id>/<project_id>/<timestamp>-<filename>
        const fileExt = selectedFile.name.split('.').pop() || 'jpg';
        const sanitizedExt = fileExt.replace(/[^a-zA-Z0-9]/g, '');
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${sanitizedExt}`;
        const storagePath = `${orgId}/${selectedProjectId}/${filename}`;

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('site-logs')
          .upload(storagePath, compressedFile, {
            contentType: compressedFile.type || 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          setError(`Erreur lors de l'envoi de l'image: ${uploadError.message}`);
          return;
        }

        // Limitation: Le schéma site_logs prend une seule photo par entrée (photo_url text not null)
        const result = await createSiteLog({
          project_id: selectedProjectId,
          photo_path: storagePath,
          caption: caption.trim() || undefined,
        });

        if (!result.success) {
          setError(result.error);
          return;
        }

        closeModal();
      } catch (err: unknown) {
        console.error('Journal upload error:', err);
        setError("Une erreur est survenue lors du traitement de l'image.");
      }
    });
  }

  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Site log"
        title="Daily Journal"
        description="Capture photos, voice notes, blockers, and completed tasks for each job site."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cartes d'actions rapides */}
        <Card
          className="cursor-pointer p-5 transition-shadow hover:shadow-md"
          raised
          onClick={() => openModal('photo')}
        >
          <div className="flex items-center justify-between">
            <CameraIcon size={24} className="text-accent-700" />
            <span className="bg-accent-50 text-accent-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Nouveau
            </span>
          </div>
          <p className="font-display mt-4 text-lg font-semibold text-neutral-900">Upload photos</p>
          <p className="mt-1 text-sm text-neutral-500">
            Ajoutez des photos de chantier avec description pour suivre l&apos;avancement.
          </p>
        </Card>

        {/* 
          Limitation: Pas de colonne pour les notes vocales dans site_logs (schéma Postgres 0008).
          Le bouton reste désactivé avec mention "Bientôt disponible".
          Une migration SQL serait nécessaire pour ajouter voice_url.
        */}
        <Card
          className="cursor-not-allowed border-neutral-200 bg-neutral-50 p-5 opacity-65"
          raised={false}
        >
          <div className="flex items-center justify-between">
            <MicrophoneIcon size={24} className="text-neutral-400" />
            <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              Bientôt disponible
            </span>
          </div>
          <p className="font-display mt-4 text-lg font-semibold text-neutral-600">
            Record voice notes
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            Enregistrez des notes vocales directement sur le terrain (fonctionnalité à venir).
          </p>
        </Card>

        <Card
          className="cursor-pointer p-5 transition-shadow hover:shadow-md"
          raised
          onClick={() => openModal('note')}
        >
          <div className="flex items-center justify-between">
            <NotePencilIcon size={24} className="text-accent-700" />
            <span className="bg-accent-50 text-accent-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
              Nouveau
            </span>
          </div>
          <p className="font-display mt-4 text-lg font-semibold text-neutral-900">
            Write daily notes
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Rédigez des remarques et rapports quotidiens accompagnés d&apos;une preuve visuelle.
          </p>
        </Card>
      </div>

      <SectionCard title="Progress snapshot" description="How the current workday is progressing.">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Completed tasks', '18'],
            ['Blocked tasks', '3'],
            ['Photos uploaded', siteLogs.length.toString()],
            ['Progress', '76%'],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {label}
              </p>
              <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
            </Card>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Historique du journal"
        description="Entrées récentes du journal de chantier."
      >
        {siteLogs.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Aucune entrée dans le journal"
            description="Commencez par ajouter une photo ou une note de chantier ci-dessus."
            actionLabel="Ajouter une photo"
            onAction={() => openModal('photo')}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {siteLogs.map((log) => {
              const projectName = projectMap.get(log.project_id) || 'Chantier';
              const formattedDate = new Date(log.created_at).toLocaleDateString('fr-TN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <Card key={log.id} className="flex flex-col justify-between overflow-hidden" raised>
                  {log.signed_photo_url ? (
                    <div className="relative h-48 w-full bg-neutral-100">
                      <img
                        src={log.signed_photo_url}
                        alt={log.caption || 'Photo de chantier'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-48 w-full items-center justify-center bg-neutral-100 text-neutral-400">
                      <ImageIcon size={36} />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col justify-between gap-2 p-4">
                    <div>
                      <div className="text-accent-700 flex items-center justify-between text-xs font-medium">
                        <span>{projectName}</span>
                        <span className="flex items-center gap-1 text-neutral-500">
                          <ClockIcon size={14} />
                          {formattedDate}
                        </span>
                      </div>
                      {log.caption ? (
                        <p className="mt-2 line-clamp-3 text-sm text-neutral-800">{log.caption}</p>
                      ) : (
                        <p className="mt-2 text-xs italic text-neutral-400">Sans description</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Modal d'ajout au journal de chantier */}
      {modalMode !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                {modalMode === 'photo'
                  ? 'Ajouter une photo de chantier'
                  : 'Rédiger une note quotidienne'}
              </h2>
              <button
                onClick={closeModal}
                className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Sélecteur de projet */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-900">Chantier (Projet) *</label>
                {projects.length === 0 ? (
                  <p className="text-danger text-sm">
                    Aucun projet actif trouvé. Veuillez d&apos;abord créer un chantier.
                  </p>
                ) : (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
                    required
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Sélection de photo */}
              {/* 
                Limitation: Le schéma site_logs requiert 1 seule photo (photo_url NOT NULL).
                L'envoi de plusieurs photos à la fois n'est pas géré par la table actuelle.
              */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-900">Photo de chantier *</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="rounded-control bg-neutral-0 file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 border border-neutral-300 px-3 py-2 text-sm text-neutral-700 outline-none file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-sm file:font-semibold"
                  required
                />
                {filePreview && (
                  <div className="relative mt-2 h-40 w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                    <img src={filePreview} alt="Aperçu" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>

              {/* Description / Caption */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-900">
                  {modalMode === 'note' ? 'Note / Description *' : 'Description (optionnelle)'}
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Détails du travail accompli, problèmes rencontrés..."
                  rows={3}
                  className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
                />
              </div>

              {error && <p className="text-danger text-sm">{error}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Annuler
                </Button>
                <Button type="submit" loading={isPending} disabled={projects.length === 0}>
                  <PlusIcon size={16} className="me-1 inline" />
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

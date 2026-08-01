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
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

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
  selectedDate: string;
}

type Scope = 'jour' | 'semaine';

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function JournalView({ orgId, projects, siteLogs, selectedDate }: JournalViewProps) {
  const router = useRouter();
  const selectedDateObject = useMemo(() => new Date(`${selectedDate}T00:00:00`), [selectedDate]);
  const [scope, setScope] = useState<Scope>('semaine');
  const [modalMode, setModalMode] = useState<'closed' | 'photo' | 'note'>('closed');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id ?? '');
  const [caption, setCaption] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visibleLogs = useMemo(() => {
    const start = scope === 'jour' ? selectedDateObject : startOfWeek(selectedDateObject);
    const end =
      scope === 'jour'
        ? selectedDateObject
        : new Date(new Date(start).setDate(start.getDate() + 6));
    return siteLogs.filter((log) => {
      const createdAt = new Date(log.created_at);
      return (
        createdAt >= start &&
        createdAt <= new Date(end.toISOString().slice(0, 10) + 'T23:59:59.999')
      );
    });
  }, [scope, selectedDateObject, siteLogs]);

  const groupedLogs = useMemo(() => {
    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    const groups = new Map<string, SiteLogWithSignedUrl[]>();

    for (const log of visibleLogs) {
      const key = projectMap.get(log.project_id) ?? 'Chantier inconnu';
      const list = groups.get(key) ?? [];
      list.push(log);
      groups.set(key, list);
    }

    return Array.from(groups.entries()).map(([projectName, logs]) => ({
      projectName,
      logs: logs.sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      ),
    }));
  }, [projects, visibleLogs]);

  const summary = useMemo(() => {
    return {
      photos: visibleLogs.length,
      projects: new Set(visibleLogs.map((log) => log.project_id)).size,
      notes: visibleLogs.filter((log) => Boolean(log.caption)).length,
    };
  }, [visibleLogs]);

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

  function changeDate(value: string) {
    router.push(`/journal?date=${value}`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setFilePreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image valide.');
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
      setError('Veuillez sélectionner un chantier.');
      return;
    }

    if (!selectedFile) {
      setError('Veuillez sélectionner une photo.');
      return;
    }

    startTransition(async () => {
      try {
        // Compression côté client selon l’exigence du cahier des charges.
        const options = {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(selectedFile, options);

        // Le bucket RLS impose un chemin commençant par "<org_id>/...".
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

        // Limitation: le schéma site_logs ne prend qu’une seule photo par entrée.
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
        setError('Une erreur est survenue lors du traitement de l’image.');
      }
    });
  }

  const selectedDateLabel = new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(selectedDateObject);

  const scopeLabel = scope === 'jour' ? 'Journée' : 'Semaine';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Journal de chantier"
        title="Journal quotidien"
        description="Conservez les photos et les notes de chantier par jour ou par semaine, chantier par chantier."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 shadow-[0_4px_14px_rgba(17,19,24,0.04)]">
              <ClockIcon size={16} className="text-neutral-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => changeDate(event.target.value)}
                className="border-0 bg-transparent p-0 text-sm outline-none"
              />
            </div>
            <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white p-1">
              {(['jour', 'semaine'] as Scope[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setScope(option)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    scope === option
                      ? 'bg-accent-600 text-white'
                      : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  {option === 'jour' ? 'Jour' : 'Semaine'}
                </button>
              ))}
            </div>
          </>
        }
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
          <p className="font-display mt-4 text-lg font-semibold text-neutral-900">
            Ajouter une photo
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Ajoutez des photos de chantier avec une description pour suivre l’avancement.
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
          <p className="font-display mt-4 text-lg font-semibold text-neutral-600">Notes vocales</p>
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
            Rédiger une note
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Rédigez des remarques et rapports quotidiens accompagnés d’une preuve visuelle.
          </p>
        </Card>
      </div>

      <SectionCard title="Vue rapide" description="Résumé de la période sélectionnée.">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Photos visibles', summary.photos.toString()],
            ['Chantiers', summary.projects.toString()],
            ['Notes', summary.notes.toString()],
            ['Période', scopeLabel],
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
        title="Timeline du journal"
        description={`Entrées du ${selectedDateLabel} (${scopeLabel.toLowerCase()}).`}
      >
        {visibleLogs.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="Aucune entrée sur cette période"
            description="Commencez par ajouter une photo ou une note de chantier ci-dessus."
            actionLabel="Ajouter une photo"
            onAction={() => openModal('photo')}
          />
        ) : (
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <SectionCard
                key={group.projectName}
                title={group.projectName}
                description={`${group.logs.length} entrée(s) sur la période.`}
              >
                <div className="space-y-4">
                  {group.logs.map((log) => {
                    const formattedDate = new Intl.DateTimeFormat('fr-TN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(log.created_at));

                    return (
                      <Card
                        key={log.id}
                        className="grid gap-4 overflow-hidden md:grid-cols-[280px_1fr]"
                        raised
                      >
                        {log.signed_photo_url ? (
                          <div className="relative min-h-[220px] bg-neutral-100">
                            <img
                              src={log.signed_photo_url}
                              alt={log.caption || 'Photo de chantier'}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex min-h-[220px] items-center justify-center bg-neutral-100 text-neutral-400">
                            <ImageIcon size={36} />
                          </div>
                        )}

                        <div className="flex flex-col justify-between gap-3 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="text-accent-700 text-xs font-medium">
                                <span>Entrée du journal</span>
                              </div>
                              {log.caption ? (
                                <p className="mt-2 text-sm leading-6 text-neutral-900">
                                  {log.caption}
                                </p>
                              ) : (
                                <p className="mt-2 text-sm italic text-neutral-400">
                                  Aucune note textuelle
                                </p>
                              )}
                            </div>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-neutral-500">
                              <ClockIcon size={14} />
                              {formattedDate}
                            </span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </SectionCard>
            ))}
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
                <label className="text-sm font-medium text-neutral-900">Chantier *</label>
                {projects.length === 0 ? (
                  <p className="text-danger text-sm">
                    Aucun chantier actif trouvé. Veuillez d’abord créer un chantier.
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
                Limitation : le schéma site_logs requiert une seule photo (photo_url NOT NULL).
                L’envoi de plusieurs photos n’est pas géré par la table actuelle.
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
                  {modalMode === 'note' ? 'Note / description *' : 'Description (optionnelle)'}
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

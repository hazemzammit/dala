'use client';

import type { Project } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import { PROJECT_TYPES, type CreateProjectInput } from '@dala/validation';
import { CameraIcon, XIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import type { UpdateProjectInput } from './actions';


const PROJECT_TYPE_LABEL: Record<(typeof PROJECT_TYPES)[number], string> = {
  residentiel: 'Résidentiel',
  commercial: 'Commercial',
  industriel: 'Industriel',
  renovation: 'Rénovation',
  infrastructure: 'Infrastructure',
  autre: 'Autre',
};

type ProjectMutationResult =
  { success: true; project: Project } | { success: false; error: string };

type CreateProjectAction = (input: CreateProjectInput) => Promise<ProjectMutationResult>;
type UpdateProjectAction = (input: UpdateProjectInput) => Promise<ProjectMutationResult>;

/**
 * Field-coverage pass — two fixes to this form:
 * 1. `cover_photo_url` (migration 0070): was queried everywhere on web,
 *    never uploadable or displayed anywhere. Upload follows the exact
 *    pattern already established by settings/account/AccountForm.tsx
 *    (upload to `org-files` at `{org_id}/covers/{uuid}.jpg`, then pass the
 *    bare storage path — never the signed URL — into create/update). No
 *    crop step here unlike the avatar flow: a project cover is a landscape
 *    banner, not a square avatar, so cropping to a fixed aspect isn't the
 *    right call without a real design decision on the target ratio.
 * 2. `start_date`/`project_type` were wrapped in `{!isEdit && (...)}` —
 *    create-only, even though `updateProjectSchema` (and the `updateProject`
 *    action) already fully support editing both. Unwrapped; both fields
 *    are now shown and required in edit mode too, matching the DB's own
 *    non-null constraint on both columns.
 */
export function ProjectFormModal({
  project,
  onClose,
  onSaved,
  createProject,
  updateProject,
  activeOrgId,
}: {
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
  activeOrgId: string;
}) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [clientName, setClientName] = useState(project?.client_name ?? '');
  const [address, setAddress] = useState(project?.address ?? '');
  const [startDate, setStartDate] = useState(project?.start_date ?? '');
  const [projectType, setProjectType] = useState<(typeof PROJECT_TYPES)[number] | ''>(
    project?.project_type ?? '',
  );
  const [budgetTotal, setBudgetTotal] = useState(project?.budget_total?.toString() ?? '');
  const [coverPhotoPath, setCoverPhotoPath] = useState(project?.cover_photo_url ?? '');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(
    (project as { signed_cover_photo_url?: string | null } | undefined)?.signed_cover_photo_url ??
      null,
  );
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image valide.');
      return;
    }
    setError(null);
    setUploadingCover(true);
    try {
      const filename = `${crypto.randomUUID()}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
      const storagePath = `${activeOrgId}/covers/${filename}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError("Impossible d'envoyer la photo.");
        return;
      }
      setCoverPhotoPath(storagePath);
      setCoverPreviewUrl(URL.createObjectURL(file));
    } catch {
      setError("Impossible d'envoyer la photo.");
    } finally {
      setUploadingCover(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Le nom du chantier doit contenir au moins 2 caractères.');
      return;
    }
    if (!startDate) {
      setError('La date de début est requise.');
      return;
    }
    if (!projectType) {
      setError('Le type de projet est requis.');
      return;
    }
    const parsedBudget = budgetTotal ? Number(budgetTotal) : undefined;
    if (parsedBudget !== undefined && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      setError('Le budget doit être un nombre positif.');
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateProject({
            id: project.id,
            version: project.version,
            name,
            client_name: clientName || undefined,
            address: address || undefined,
            start_date: startDate || undefined,
            project_type: projectType || undefined,
            budget_total: parsedBudget,
            cover_photo_url: coverPhotoPath || undefined,
          })
        : await createProject({
            name,
            client_name: clientName || undefined,
            address: address || undefined,
            start_date: startDate,
            project_type: projectType as (typeof PROJECT_TYPES)[number],
            budget_total: parsedBudget,
            cover_photo_url: coverPhotoPath || undefined,
          });

      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved?.(result.project);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEdit ? 'Modifier le chantier' : 'Créer un chantier'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Photo de couverture</label>
            <label className="group relative flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 hover:border-neutral-400">
              {coverPreviewUrl ? (
                <img src={coverPreviewUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1.5 text-neutral-500">
                  <CameraIcon size={22} />
                  <span className="text-xs">
                    {uploadingCover ? 'Envoi en cours…' : 'Ajouter une photo'}
                  </span>
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleCoverFileChange(e)}
                disabled={uploadingCover}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>

          <FormField
            label="Nom du chantier"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Villa Ben Ali"
            required
          />
          <FormField
            label="Client"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Ex. M. Ben Ali"
          />
          <FormField
            label="Adresse"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ex. Sousse, Tunisie"
          />
          <FormField
            label="Date de début"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-neutral-900">Type de projet</label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as (typeof PROJECT_TYPES)[number])}
              required
              className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              <option value="" disabled>
                Sélectionner un type
              </option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </div>
          <FormField
            label="Budget estimé (TND)"
            type="number"
            min={0}
            value={budgetTotal}
            onChange={(e) => setBudgetTotal(e.target.value)}
            placeholder="Ex. 50000"
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending || uploadingCover}>
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

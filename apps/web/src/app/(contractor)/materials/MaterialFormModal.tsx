'use client';

import type { Project, Material } from '@dala/shared-types';
import type { CreateMaterialInput, UpdateMaterialInput } from '@dala/validation';
import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';

type MaterialMutationResult =
  { success: true; material: Material } | { success: false; error: string };

type CreateMaterialAction = (input: CreateMaterialInput) => Promise<MaterialMutationResult>;
type UpdateMaterialAction = (input: UpdateMaterialInput) => Promise<MaterialMutationResult>;

export function MaterialFormModal({
  material,
  projects,
  onClose,
  onSaved,
  createMaterial,
  updateMaterial,
}: {
  material?: Material;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved?: (material: Material) => void;
  createMaterial: CreateMaterialAction;
  updateMaterial: UpdateMaterialAction;
}) {
  const isEdit = !!material;
  const [item, setItem] = useState(material?.item ?? '');
  const [quantity, setQuantity] = useState(material?.quantity?.toString() ?? '');
  const [projectId, setProjectId] = useState(material?.project_id ?? '');
  const [urgency, setUrgency] = useState(material?.urgency ?? 'normal');
  const [status, setStatus] = useState(material?.status ?? 'pending');
  const [note, setNote] = useState(material?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (item.trim().length < 2) {
      setError('Le nom du matériau doit contenir au moins 2 caractères.');
      return;
    }

    const parsedQuantity = quantity ? Number(quantity) : undefined;
    if (parsedQuantity !== undefined && (!Number.isFinite(parsedQuantity) || parsedQuantity < 0)) {
      setError('La quantité doit être un nombre positif.');
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateMaterial({
            id: material.id,
            item,
            project_id: projectId || undefined,
            quantity: parsedQuantity,
            urgency,
            status,
            note: note || undefined,
          })
        : await createMaterial({
            item,
            project_id: projectId || undefined,
            quantity: parsedQuantity,
            urgency,
            status,
            note: note || undefined,
          });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved?.(result.material);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-lg p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEdit ? 'Modifier le matériau' : 'Ajouter un matériau'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormField
            label="Matériau"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Ex. Cement"
            required
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Quantité"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex. 240"
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">Projet</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="bg-neutral-0 w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Aucun projet</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">Urgency</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value as 'normal' | 'urgent')}
                className="bg-neutral-0 w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'pending' | 'approved' | 'rejected')}
                className="bg-neutral-0 w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-900">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Supplier note, delivery detail, etc."
              className="bg-neutral-0 min-h-[96px] w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

type ProjectOption = Pick<Project, 'id' | 'name'>;

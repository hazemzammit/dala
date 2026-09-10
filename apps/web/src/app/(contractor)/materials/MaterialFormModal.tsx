'use client';

import type { Project, Material } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import type { CreateMaterialRequestInput, SetMaterialCostInput } from '@dala/validation';
import { XIcon } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

type CreateMaterialResult =
  { success: true; material: Material } | { success: false; error: string };
type ActionResult = { success: true } | { success: false; error: string };

type CreateMaterialAction = (input: CreateMaterialRequestInput) => Promise<CreateMaterialResult>;
type SetMaterialCostAction = (input: SetMaterialCostInput) => Promise<ActionResult>;

type ProjectOption = Pick<Project, 'id' | 'name'>;

/**
 * FLAGGED FOR HAZEM — the collaborator's original version of this modal had
 * a "Status" dropdown (pending/approved/rejected) available in BOTH create
 * and edit mode, wired to a generic updateMaterial({ status }) call. That
 * would have let a plain field update set status='approved' directly,
 * bypassing approve_material_request() — the RPC migration 0073 built
 * specifically to push a matching project_expenses row on approval. Real
 * approval/rejection now only happens through the dedicated
 * approveMaterial/rejectMaterial actions in MaterialsView (matching
 * mobile's materials.tsx). This form no longer edits status at all.
 *
 * Also: mobile itself has no general "edit item/quantity/urgency/note
 * after creation" action — only cost/project_id (setMaterialCostSchema).
 * So "edit mode" here now only edits cost + project, not the full field
 * set the collaborator's version implied it could. Not a regression from
 * mobile's real feature set, just no longer pretending to support
 * something no backend path actually allows.
 */
export function MaterialFormModal({
  material,
  projects,
  onClose,
  onSaved,
  createMaterial,
  setMaterialCost,
}: {
  material?: Material;
  projects: ProjectOption[];
  onClose: () => void;
  onSaved?: () => void;
  createMaterial: CreateMaterialAction;
  setMaterialCost: SetMaterialCostAction;
}) {
  const isEdit = !!material;
  const [item, setItem] = useState(material?.item ?? '');
  const [quantity, setQuantity] = useState(material?.quantity?.toString() ?? '');
  const [projectId, setProjectId] = useState(material?.project_id ?? '');
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>(material?.urgency ?? 'normal');
  const [cost, setCost] = useState(material?.cost != null ? String(material.cost) : '');
  const [note, setNote] = useState(material?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedQuantity = quantity ? Number(quantity) : undefined;
    if (parsedQuantity !== undefined && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) {
      setError('La quantité doit être un nombre positif.');
      return;
    }
    const parsedCost = cost.trim() ? Number(cost) : null;
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost <= 0)) {
      setError('Le coût doit être un nombre positif.');
      return;
    }

    if (isEdit) {
      startTransition(async () => {
        const result = await setMaterialCost({
          material_id: material.id,
          cost: parsedCost,
          project_id: projectId || null,
        });
        if (!result.success) {
          setError(result.error);
          return;
        }
        onSaved?.();
        onClose();
      });
      return;
    }

    if (item.trim().length < 2) {
      setError('Le nom du matériau doit contenir au moins 2 caractères.');
      return;
    }

    startTransition(async () => {
      const result = await createMaterial({
        item,
        project_id: projectId || undefined,
        quantity: parsedQuantity,
        urgency,
        note: note || undefined,
        cost: parsedCost ?? undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved?.();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-lg p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {isEdit ? 'Modifier le coût / projet' : 'Ajouter un matériau'}
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
          {!isEdit && (
            <FormField
              label="Matériau"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ex. Ciment"
              required
            />
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {!isEdit && (
              <FormField
                label="Quantité"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex. 240"
              />
            )}
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
            {!isEdit && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-neutral-900">Urgence</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as 'normal' | 'urgent')}
                  className="bg-neutral-0 w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            )}
            <FormField
              label="Coût (TND, facultatif)"
              type="number"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Ex. 850"
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">Note</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Détail fournisseur, livraison, etc."
                className="bg-neutral-0 min-h-[96px] w-full rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm outline-none"
              />
            </div>
          )}

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

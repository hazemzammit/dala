'use client';

import type { Project } from '@dala/shared-types';
import type { CreateProjectInput, UpdateProjectInput } from '@dala/validation';
import { XIcon } from '@phosphor-icons/react';
import { useState, useTransition, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';

type ProjectMutationResult =
  { success: true; project: Project } | { success: false; error: string };

type CreateProjectAction = (input: CreateProjectInput) => Promise<ProjectMutationResult>;
type UpdateProjectAction = (input: UpdateProjectInput) => Promise<ProjectMutationResult>;

export function ProjectFormModal({
  project,
  onClose,
  onSaved,
  createProject,
  updateProject,
}: {
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
}) {
  const isEdit = !!project;
  const [name, setName] = useState(project?.name ?? '');
  const [clientName, setClientName] = useState(project?.client_name ?? '');
  const [address, setAddress] = useState(project?.address ?? '');
  const [budgetTotal, setBudgetTotal] = useState(project?.budget_total?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('Le nom du chantier doit contenir au moins 2 caractères.');
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
            budget_total: parsedBudget,
          })
        : await createProject({
            name,
            client_name: clientName || undefined,
            address: address || undefined,
            budget_total: parsedBudget,
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
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

'use client';

import type { Project } from '@dala/shared-types';
import { Button, Card, FormField } from '@dala/ui-web';
import type { CreateProjectExpenseInput } from '@dala/validation';
import { XIcon } from '@phosphor-icons/react';
import imageCompression from 'browser-image-compression';
import { useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import { createProjectExpense } from './actions';

type ProjectOption = Pick<Project, 'id' | 'name' | 'status'>;

export function ProjectExpenseFormModal({
  projects,
  orgId,
  defaultProjectId,
  onClose,
  onSaved,
}: {
  projects: ProjectOption[];
  orgId: string;
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [category, setCategory] = useState<CreateProjectExpenseInput['category']>('materiaux');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      setReceiptPreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image valide.');
      return;
    }

    setError(null);
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setReceiptPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    const today = new Date().toISOString().slice(0, 10);
    if (!projectId) {
      setError('Veuillez sélectionner un chantier.');
      return;
    }
    if (!category) {
      setError('Merci de sélectionner une catégorie.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Merci d’indiquer un montant valide.');
      return;
    }
    if (description.trim().length > 200) {
      setError('La description ne peut pas dépasser 200 caractères.');
      return;
    }
    if (expenseDate > today) {
      setError('La date ne peut pas être dans le futur.');
      return;
    }

    startTransition(async () => {
      let receiptPhotoUrl: string | undefined;

      if (receiptFile) {
        const compressedFile = await imageCompression(receiptFile, {
          maxSizeMB: 1.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });

        const fileExt = receiptFile.name.split('.').pop() || 'jpg';
        const sanitizedExt = fileExt.replace(/[^a-zA-Z0-9]/g, '');
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${sanitizedExt}`;
        const storagePath = `${orgId}/${projectId}/expense-receipts/${filename}`;

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('site-logs')
          .upload(storagePath, compressedFile, {
            contentType: compressedFile.type || 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          setError(`Erreur lors de l’envoi du justificatif: ${uploadError.message}`);
          return;
        }

        receiptPhotoUrl = storagePath;
      }

      const result = await createProjectExpense({
        project_id: projectId,
        category,
        amount: parsedAmount,
        description: description.trim() || undefined,
        receipt_photo_url: receiptPhotoUrl,
        expense_date: expenseDate,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Ajouter une dépense
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Les reçus photo sont compressés côté navigateur avant l’envoi vers le stockage.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">Chantier</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {projects
                .filter((project) => project.status === 'active')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-900">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CreateProjectExpenseInput['category'])}
              className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              <option value="materiaux">Matériaux</option>
              <option value="carburant">Carburant</option>
              <option value="sous_traitance">Sous-traitance</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <FormField
            label="Montant (TND)"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ex. 1250"
          />

          <FormField
            label="Date de dépense"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">
              Description (optionnelle)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="bg-neutral-0 min-h-[96px] w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-sm outline-none"
              placeholder="Détails du ticket, fournisseur, livraison..."
            />
            <p className="text-xs text-neutral-500">200 caractères maximum.</p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">
              Justificatif photo (optionnel)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="rounded-control bg-neutral-0 file:bg-accent-50 file:text-accent-700 hover:file:bg-accent-100 border border-neutral-300 px-3 py-2 text-sm text-neutral-700 outline-none file:me-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-sm file:font-semibold"
            />
            {receiptPreview && (
              <div className="relative mt-2 h-40 w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                <img
                  src={receiptPreview}
                  alt="Aperçu du justificatif"
                  className="h-full w-full object-contain"
                />
              </div>
            )}
          </div>

          {error && <p className="text-danger text-sm md:col-span-2">{error}</p>}

          <div className="mt-2 flex justify-end gap-3 md:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

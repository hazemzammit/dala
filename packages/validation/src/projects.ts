import { z } from 'zod';

/** Doc 03 §3.10.3 — Create/Edit project. */
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Nom du chantier requis.'),
  client_name: z.string().optional(),
  address: z.string().optional(),
  budget_total: z.number().positive().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Doc 01 §1.9 — editable-record optimistic concurrency. Every update must
 * carry the `version` it last read; a mismatch means someone else wrote to
 * the row first (409, not a silent overwrite).
 */
export const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Doc 02 §2.2b — project expense ledger. */
const todayDate = new Date().toISOString().slice(0, 10);

export const createProjectExpenseSchema = z.object({
  project_id: z.string().uuid(),
  category: z.enum(['materiaux', 'carburant', 'sous_traitance', 'autre'], {
    required_error: 'Merci de sélectionner une catégorie.',
  }),
  amount: z
    .number({
      required_error: 'Merci d’indiquer un montant valide.',
      invalid_type_error: 'Merci d’indiquer un montant valide.',
    })
    .positive('Merci d’indiquer un montant valide.'),
  description: z
    .string()
    .max(200, 'La description ne peut pas dépasser 200 caractères.')
    .optional(),
  receipt_photo_url: z.string().url().optional(),
  expense_date: z
    .string()
    .date()
    .refine((value) => value <= todayDate, {
      message: 'La date ne peut pas être dans le futur.',
    }),
});
export type CreateProjectExpenseInput = z.infer<typeof createProjectExpenseSchema>;

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
  version: z.number().int().positive(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Doc 02 §2.2b — project expense ledger. */
export const createProjectExpenseSchema = z.object({
  project_id: z.string().uuid(),
  category: z.enum(['materiaux', 'carburant', 'sous_traitance', 'autre']),
  amount: z.number().positive(),
  description: z.string().optional(),
  receipt_photo_url: z.string().url().optional(),
  expense_date: z.string().date().optional(),
});
export type CreateProjectExpenseInput = z.infer<typeof createProjectExpenseSchema>;

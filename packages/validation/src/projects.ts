import { z } from 'zod';

/**
 * Doc 03 §3.10.3 "Type de projet" — spec never enumerates the select's
 * values. Migration 0028's judgment call, kept in sync with the DB check
 * constraint (see that migration's header for the disclosed reasoning).
 */
export const PROJECT_TYPES = [
  'residentiel',
  'commercial',
  'industriel',
  'renovation',
  'infrastructure',
  'autre',
] as const;

/**
 * Doc 03 §3.10.3 — Create/Edit project.
 *
 * `start_date`/`project_type` added migration 0028 — both are listed
 * "Required" in Doc 03 §3.10.3 but the columns didn't exist before that
 * migration and this schema didn't validate them either (a real Doc-prose-
 * vs-schema gap, confirmed by reading the migrations before writing this).
 * `start_date`'s "cannot be >2 years in the past" rule is enforced here,
 * not the DB, matching how the rest of this schema keeps business-rule
 * validation client-side and the DB column itself permissive (nullable/
 * unconstrained beyond the enum check).
 */
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Nom du chantier requis.').max(100, '100 caractères maximum.'),
  client_name: z.string().optional(),
  address: z.string().optional(),
  start_date: z
    .string()
    .date()
    .refine((d) => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return new Date(d) >= twoYearsAgo;
    }, 'La date de début ne peut pas remonter à plus de 2 ans.'),
  budget_total: z.number().min(0, 'Le budget doit être positif.').optional(),
  project_type: z.enum(PROJECT_TYPES, { errorMap: () => ({ message: 'Type de projet requis.' }) }),
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

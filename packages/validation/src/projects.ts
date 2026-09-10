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
  // IMPROVEMENT-PLAN PHASE 3 (§1.8) FIX — was `z.string().url()`, which
  // rejects every real value this field is ever set to: every photo_url-
  // shaped column in this schema stores a bare Storage PATH
  // (`{org_id}/{category}/{uuid}.jpg`), never a public/signed URL
  // directly (Doc 01 §1.3.11, lib/storage.ts's own header). A `.url()`
  // check requires a scheme (`https://...`) and fails on a bare path —
  // confirmed with a standalone zod test before concluding this, not
  // assumed. Since this phase is the first to actually wire a value into
  // this field, the bug was latent (never exercised) until now. Fixed
  // here because it's the exact field this phase's own work depends on;
  // NOT fixed for the same `.url()` pattern on `submitSiteLogSchema`'s
  // `photo_url`/`voice_note_url`/`thumbnail_url` or
  // `createSafetyIncidentSchema`'s `photo_url` (packages/validation/src/
  // fieldOps.ts) — those are outside every file this phase touches, and
  // the plan's own guardrail is to fix what's in scope and flag the rest
  // rather than pull unrelated fixes forward. See docs/PHASE_3_BRIEF.md.
  receipt_photo_url: z.string().min(1).optional(),
  expense_date: z.string().date().optional(),
});
export type CreateProjectExpenseInput = z.infer<typeof createProjectExpenseSchema>;

/**
 * FLAGGED FOR HAZEM — added during the web-integration pass (Phase 3,
 * billing rebuild). No schema for create_invoice()'s params
 * (migration 0074) existed anywhere in this package before. Matches the
 * RPC's own signature exactly: project_id/period_from/period_to/due_date
 * required, notes optional. No `status` or `amount` field — this schema
 * intentionally can't express either, since the real `invoices` table
 * doesn't have them (see this integration pass's other flags on that
 * exact point, hit repeatedly across projects/, dashboard/, reports/, and
 * client-portal/).
 */
export const createInvoiceSchema = z
  .object({
    project_id: z.string().uuid(),
    period_from: z.string().date(),
    period_to: z.string().date(),
    due_date: z.string().date(),
    notes: z.string().optional(),
  })
  .refine((data) => data.period_to >= data.period_from, {
    message: 'La fin de période doit être après le début.',
    path: ['period_to'],
  });
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

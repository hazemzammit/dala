import { z } from 'zod';

/**
 * packages/validation/src/fieldOps.ts
 *
 * Phase 3 — Materials (contractor approval side), Site logs, Safety &
 * insurance, Client portal management. `requestMaterialSchema` (the
 * worker-side request form) stays in money.ts, right next to
 * requestAdvanceSchema/createAdvanceSchema — it was already there before
 * this pass and moving it would just churn the diff for no reason.
 */

// ---------------------------------------------------------------------------
// Materials — contractor approval actions (Doc 03 §3.15)
// ---------------------------------------------------------------------------

export const approveMaterialSchema = z.object({
  material_id: z.string().uuid(),
});
export type ApproveMaterialInput = z.infer<typeof approveMaterialSchema>;

export const refuseMaterialSchema = z.object({
  material_id: z.string().uuid(),
  rejection_reason: z.string().min(3, 'La raison doit contenir au moins 3 caractères.'),
});
export type RefuseMaterialInput = z.infer<typeof refuseMaterialSchema>;

export const reassignMaterialSchema = z.object({
  material_id: z.string().uuid(),
  worker_id: z.string().uuid(),
});
export type ReassignMaterialInput = z.infer<typeof reassignMaterialSchema>;

// ---------------------------------------------------------------------------
// Site logs — worker Update Chantier submit (Doc 03 §4.2)
// ---------------------------------------------------------------------------

/**
 * "At least one of photo, voice note, or text" is enforced with
 * `.refine()` below rather than three independent `.optional()` fields
 * with no cross-field check — the same validation gap pattern already
 * fixed in requestMaterialSchema above, caught here before it shipped
 * instead of after.
 */
export const submitSiteLogSchema = z
  .object({
    project_id: z.string().uuid(),
    photo_url: z.string().url().optional(),
    voice_note_url: z.string().url().optional(),
    note_text: z.string().max(500, 'Note limitée à 500 caractères.').optional(),
    thumbnail_url: z.string().url().optional(),
    location_lat: z.number().min(-90).max(90).optional(),
    location_lng: z.number().min(-180).max(180).optional(),
    idempotency_key: z.string().uuid(),
  })
  .refine((data) => Boolean(data.photo_url || data.voice_note_url || data.note_text?.trim()), {
    message: 'Ajoutez au moins une photo, une note vocale ou un texte avant d’envoyer.',
    path: ['note_text'],
  });
export type SubmitSiteLogInput = z.infer<typeof submitSiteLogSchema>;

// ---------------------------------------------------------------------------
// Safety incidents (Doc 03 §3.17)
// ---------------------------------------------------------------------------

export const createSafetyIncidentSchema = z.object({
  project_id: z.string().uuid().optional(),
  description: z.string().min(1, 'Description requise.'),
  severity: z.enum(['minor', 'moderate', 'severe']),
  location: z.string().optional(),
  photo_url: z.string().url().optional(),
  involved_worker_ids: z.array(z.string().uuid()).optional(),
});
export type CreateSafetyIncidentInput = z.infer<typeof createSafetyIncidentSchema>;

// ---------------------------------------------------------------------------
// Insurance tracker (Doc 03 §3.17)
// ---------------------------------------------------------------------------

export const createOrgInsuranceSchema = z.object({
  provider_name: z.string().min(1, 'Fournisseur requis.'),
  policy_number: z.string().optional(),
  coverage_type: z.string().optional(),
  document_url: z.string().url().optional(),
  expires_at: z.string().min(1, "Date d'expiration requise."),
  reminder_enabled: z.boolean().default(true),
});
export type CreateOrgInsuranceInput = z.infer<typeof createOrgInsuranceSchema>;

// ---------------------------------------------------------------------------
// Client portal management (Doc 03 §3.18)
// ---------------------------------------------------------------------------

export const setClientPortalPinSchema = z.object({
  project_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/, 'Le code doit contenir exactement 4 chiffres.'),
});
export type SetClientPortalPinInput = z.infer<typeof setClientPortalPinSchema>;

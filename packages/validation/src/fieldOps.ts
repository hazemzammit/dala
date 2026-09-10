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

/**
 * Phase 8 (improvement-plan §1.9 item 1) — contractor-initiated material
 * request, materials.tsx's own new create sheet. Deliberately a SEPARATE
 * schema from `requestMaterialSchema` (money.ts, the worker-side form) even
 * though the two share most fields — the worker form auto-resolves
 * `project_id` from today's dispatch assignment and never asks for it, and
 * has no `cost` field at all (only an owner/manager can set cost, per
 * migration 0073's own column comment). Keeping them separate avoids
 * silently widening the worker-facing schema with a field a worker screen
 * should never expose.
 */
export const createMaterialRequestSchema = z.object({
  project_id: z.string().uuid().optional(),
  item: z.string().min(1, 'Article requis.'),
  quantity: z.number().positive().optional(),
  urgency: z.enum(['normal', 'urgent']),
  note: z.string().max(200, 'Note limitée à 200 caractères.').optional(),
  cost: z.number().positive().optional(),
});
export type CreateMaterialRequestInput = z.infer<typeof createMaterialRequestSchema>;

/**
 * Phase 8 (improvement-plan §1.9 item 2) — setting/editing `cost` on an
 * already-existing (typically worker-submitted) pending request, from the
 * review sheet before approving. A plain owner/manager update under the
 * existing materials_write_owner_manager policy — no RPC, mirrors how
 * `cost` itself needs no RLS change (migration 0073's own comment).
 */
export const setMaterialCostSchema = z.object({
  material_id: z.string().uuid(),
  cost: z.number().positive().nullable(),
  project_id: z.string().uuid().nullable(),
});
export type SetMaterialCostInput = z.infer<typeof setMaterialCostSchema>;

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
/**
 * `.url()` -> `.min(1)` on photo_url/voice_note_url/thumbnail_url: same
 * latent bug already documented and fixed for createProjectExpenseSchema's
 * receipt_photo_url in projects.ts (see that file's comment) — these store
 * a bare Supabase Storage path, never a full URL, so `.url()` rejects every
 * real value. That fix deliberately left this schema alone since nothing
 * in scope at the time actually wired a value through it. The web journal
 * route (apps/web/(contractor)/journal) is now the first caller to
 * actually exercise photo_url here, so the bug stops being latent — fixed
 * now for the same reason, not a new decision.
 */
export const submitSiteLogSchema = z
  .object({
    project_id: z.string().uuid(),
    photo_url: z.string().min(1).optional(),
    voice_note_url: z.string().min(1).optional(),
    note_text: z.string().max(500, 'Note limitée à 500 caractères.').optional(),
    thumbnail_url: z.string().min(1).optional(),
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

/**
 * `incident_type` — Phase 4 (improvement-plan §3) — a closed list at the
 * app layer (Chute/Coupure/Électrocution/Accident véhicule, or a
 * free-typed "Autre" value via Select.tsx), required so the future §2.3
 * safety-by-category chart has something to group every new incident on.
 * Same reason `min(1)` rather than `.optional()` — an incident with no
 * category isn't chartable, defeating the whole point of adding the field.
 */
export const createSafetyIncidentSchema = z.object({
  project_id: z.string().uuid().optional(),
  description: z.string().min(1, 'Description requise.'),
  severity: z.enum(['minor', 'moderate', 'severe']),
  incident_type: z.string().min(1, "Type d'incident requis."),
  location: z.string().optional(),
  // `.url()` -> `.min(1)`: bare Supabase Storage path per 0020's own
  // comment on this column ("same reasoning as vehicles.photo_url/
  // workers.photo_url/projects.cover_photo_url"), never a full URL. Same
  // fix already applied to submitSiteLogSchema and
  // createProjectExpenseSchema for the identical reason — this is the
  // third and (per this integration pass's verification checklist) final
  // occurrence.
  photo_url: z.string().min(1).optional(),
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

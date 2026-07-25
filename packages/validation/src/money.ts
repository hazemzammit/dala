import { z } from 'zod';

/**
 * Doc 01 §1.11 — every money-moving mutation carries a client-generated
 * idempotency key, attached the moment the button is tapped (before the
 * request is even sent) and disabling the button immediately.
 */
export const idempotencyKeySchema = z.object({
  idempotency_key: z.string().uuid(),
});

/** Doc 02 §2.3 — quick-advance flow. */
export const createAdvanceSchema = z
  .object({
    worker_id: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().optional(),
  })
  .merge(idempotencyKeySchema);
export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;

export const approveAdvanceSchema = z
  .object({
    advance_id: z.string().uuid(),
  })
  .merge(idempotencyKeySchema);
export type ApproveAdvanceInput = z.infer<typeof approveAdvanceSchema>;

/** Doc 02 §2.3 — "mark cycle as paid." */
export const markSalaryCyclePaidSchema = z
  .object({
    salary_cycle_id: z.string().uuid(),
  })
  .merge(idempotencyKeySchema);
export type MarkSalaryCyclePaidInput = z.infer<typeof markSalaryCyclePaidSchema>;

/**
 * Doc 03 §4.3 (worker side) — material request.
 *
 * Bug fix (Phase 3): `quantity` was `.optional()` and `note` had no length
 * cap. Doc 03 §4.3's table is explicit — "Quantité: numeric, required, >0"
 * and "Note: optional, max 200 chars" — this schema silently allowed a
 * request with no quantity at all and an unbounded note, neither of which
 * matches the spec it's supposedly enforcing. `project_id` stays optional
 * here: the worker's form has no project selector (§4.3 lists only
 * Article/Quantité/Urgence/Note), so the mobile screen resolves it
 * automatically from the worker's current assignment before this schema
 * ever sees the payload — see (worker)/material-request.tsx.
 */
export const requestMaterialSchema = z.object({
  project_id: z.string().uuid().optional(),
  item: z.string().min(1, 'Indiquez un article.'),
  quantity: z.number().positive('La quantité doit être supérieure à 0.'),
  urgency: z.enum(['normal', 'urgent']).default('normal'),
  note: z.string().max(200, 'Note limitée à 200 caractères.').optional(),
});
export type RequestMaterialInput = z.infer<typeof requestMaterialSchema>;

/**
 * Doc 01 §1.11.3 lists "advance creation" as mandatory for idempotency
 * without distinguishing contractor-initiated vs. worker-initiated — this
 * was missing `idempotencyKeySchema` even though createAdvanceSchema (the
 * contractor-side twin of the same action) has it. A worker's request
 * screen has the exact same double-tap/timeout-retry risk as the
 * contractor's, so it needs the same key.
 */
export const requestAdvanceSchema = z
  .object({
    amount: z.number().positive(),
    reason: z.string().optional(),
  })
  .merge(idempotencyKeySchema);
export type RequestAdvanceInput = z.infer<typeof requestAdvanceSchema>;

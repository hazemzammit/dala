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

/** Doc 03 §4.3/§4.4 (worker side) — material and advance requests. */
export const requestMaterialSchema = z.object({
  project_id: z.string().uuid().optional(),
  item: z.string().min(1),
  quantity: z.number().positive().optional(),
  urgency: z.enum(['normal', 'urgent']).default('normal'),
  note: z.string().optional(),
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

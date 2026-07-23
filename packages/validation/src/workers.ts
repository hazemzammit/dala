import { z } from 'zod';

/** Doc 04 §4.2.5 — worker edit form. */
export const updateWorkerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2),
  phone: z.string().min(8),
  trade: z.string().optional(),
  daily_rate: z.number().positive().optional(),
});
export type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;

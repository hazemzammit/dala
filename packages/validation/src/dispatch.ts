import { z } from 'zod';

/** Doc 03 §3.11 — dispatch board assignment. */
export const createDispatchAssignmentSchema = z.object({
  project_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  worker_id: z.string().uuid(),
  assignment_date: z.string().date(),
  departure_time: z.string().optional(),
});
export type CreateDispatchAssignmentInput = z.infer<typeof createDispatchAssignmentSchema>;

/** Doc 01 §1.9 — dispatch is the highest-contention screen; conflicts are
 *  never auto-merged, always surfaced as an explicit keep-mine/use-theirs choice. */
export const updateDispatchAssignmentSchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  departure_time: z.string().optional(),
  actual_departure_time: z.string().optional(),
  confirmation_channel: z.enum(['app', 'whatsapp', 'call', 'sms']).optional(),
  version: z.number().int().positive(),
});
export type UpdateDispatchAssignmentInput = z.infer<typeof updateDispatchAssignmentSchema>;

/** Doc 02 §2.2 — vehicle CRUD. */
export const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
  capacity: z.number().int().positive().default(1),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/**
 * Doc 03 §3.13.2 — add/invite worker.
 *
 * `email` was missing from this schema (and from the `workers` table itself
 * until migration 0017) even though Doc 00 §0.5 item 10 and Doc 03 §3.13.2
 * both require it — it's the account identity and primary invite channel,
 * not optional contact info. Fixed here alongside the migration; don't
 * reintroduce a worker-creation path that skips it.
 */
export const inviteWorkerSchema = z.object({
  full_name: z.string().min(2, "Merci d'indiquer le nom du travailleur."),
  email: z.string().email("Merci d'indiquer une adresse e-mail valide."),
  phone: z.string().min(8, 'Numéro de téléphone requis.'),
  trade: z.string().optional(),
  daily_rate: z.number().positive().optional(),
  channel: z.enum(['app', 'whatsapp', 'sms']),
});
export type InviteWorkerInput = z.infer<typeof inviteWorkerSchema>;

/** Doc 02 §2.2a — manual attendance / Pointage. */
export const markAttendanceSchema = z.object({
  worker_id: z.string().uuid(),
  record_date: z.string().date(),
  status: z.enum(['present', 'absent', 'half_day']),
  project_id: z.string().uuid().optional(),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

/** Doc 02 §2.2a — "Marquer tous présents" bulk action; one round-trip
 *  instead of one insert per worker on the roster. */
export const markAttendanceBulkSchema = z.object({
  entries: z.array(markAttendanceSchema).min(1),
});
export type MarkAttendanceBulkInput = z.infer<typeof markAttendanceBulkSchema>;

import { z } from 'zod';

/**
 * Doc 03 §3.11 dispatch — `departure_time`/`actual_departure_time` map to
 * plain Postgres `time` columns (migration 0006). Both schemas below used
 * to accept any non-empty string here, which let a bare `"7"` (no colon)
 * or any other malformed value pass client-side validation, get written
 * to the local WatermelonDB record as "valid," and only fail once the
 * background sync tried to push it — surfacing as an opaque
 * `invalid input syntax for type time: "7"` Postgres error the person
 * creating the assignment never actually saw. `timeStringSchema` below
 * catches that at the point of entry instead, with a message in French
 * matching every other validation message in this file.
 */
const TIME_HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const timeStringSchema = z
  .string()
  .regex(TIME_HH_MM_REGEX, 'Heure invalide — utilisez le format HH:MM, par exemple 07:30.');

/** Plain boolean check for callers outside zod-schema contexts (e.g. the
 *  sync-boundary sanitizer in apps/mobile/src/db/sync/pushChanges.ts). */
export function isValidTimeString(value: string): boolean {
  return TIME_HH_MM_REGEX.test(value);
}

/** Doc 03 §3.11 — dispatch board assignment. */
export const createDispatchAssignmentSchema = z.object({
  project_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  worker_id: z.string().uuid(),
  assignment_date: z.string().date(),
  departure_time: timeStringSchema.optional(),
});
export type CreateDispatchAssignmentInput = z.infer<typeof createDispatchAssignmentSchema>;

/** Doc 01 §1.9 — dispatch is the highest-contention screen; conflicts are
 *  never auto-merged, always surfaced as an explicit keep-mine/use-theirs choice. */
export const updateDispatchAssignmentSchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  departure_time: timeStringSchema.optional(),
  actual_departure_time: timeStringSchema.optional(),
  confirmation_channel: z.enum(['app', 'whatsapp', 'call', 'sms']).optional(),
  version: z.number().int().positive(),
});
export type UpdateDispatchAssignmentInput = z.infer<typeof updateDispatchAssignmentSchema>;

/**
 * Phase 26 — `PlateInput` (mobile) composes a civilian-format plate as
 * `"123 TUN 4567"` (left group 1–3 digits, literal "TUN", right group 1–4
 * digits) or passes through freeform text for non-civilian series (rental,
 * official, tourism). This validates that shape when it looks like the
 * civilian format, but never rejects a freeform value outright — plate is
 * still optional overall (Doc 02 §2.2), this only tightens the case where
 * a value IS present and LOOKS like an attempted civilian plate but is
 * malformed, catching a typo before it reaches the server rather than only
 * at PlateInput's own input-level digit filtering.
 */
const CIVILIAN_PLATE_SHAPE = /^\d{1,3}\s?TUN\s?\d{1,4}$/i;
const plateSchema = z
  .string()
  .refine(
    (value) => {
      const looksLikeCivilianAttempt = /TUN/i.test(value);
      return !looksLikeCivilianAttempt || CIVILIAN_PLATE_SHAPE.test(value);
    },
    { message: 'Plaque invalide — format attendu : 123 TUN 4567.' },
  )
  .optional();

/** Doc 02 §2.2 — vehicle CRUD. */
export const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: plateSchema,
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

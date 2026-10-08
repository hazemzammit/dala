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

/** Same HH:MM(:SS) rule as `timeStringSchema` above, exposed as a plain
 * predicate for `db/sync/pushChanges.ts`'s sync-boundary sanitization —
 * that call site needs a boolean check, not a zod schema/parse-result, and
 * reuses this regex rather than duplicating it so the two checks can never
 * drift apart. */
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

/**
 * FLAGGED FOR HAZEM — added during the web-integration pass (not present in
 * this file before). The collaborator's web dispatch screen has a
 * bulk-assign flow (N workers -> 1 vehicle/date in one action, since a
 * vehicle carries a crew, not one worker at a time) that doesn't exist on
 * mobile today. This schema mirrors createDispatchAssignmentSchema's fields
 * (no new columns, no new RPC — still a plain `dispatch_assignments`
 * insert per row) so it's additive rather than a redefinition, but the
 * *feature* (bulk assign + the ignore_capacity/ignore_vehicle_maintenance/
 * ignored_worker_ids override flags used to force past conflicts) is new
 * product surface worth a conscious decision, not something to wave through
 * silently because the web UI happened to already have it built.
 */
export const createDispatchAssignmentsSchema = z.object({
  project_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  worker_ids: z.array(z.string().uuid()).min(1),
  assignment_date: z.string().date(),
  departure_time: timeStringSchema.optional(),
  confirmation_channel: z.enum(['app', 'whatsapp', 'call', 'sms']).optional(),
  ignore_vehicle_maintenance: z.boolean().optional(),
  ignore_capacity: z.boolean().optional(),
  ignored_worker_ids: z.array(z.string().uuid()).optional(),
});
export type CreateDispatchAssignmentsInput = z.infer<typeof createDispatchAssignmentsSchema>;

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
  status: z.enum(['available', 'in_use', 'maintenance']).default('available'),
  // Field-coverage pass — photo_url (migration 0070) was queried by web's
  // vehicle list/detail pages from day one but never validated or written
  // anywhere on web. Same bare-storage-path shape used for every other
  // photo field in this package (`.min(1)`, never `.url()`).
  photo_url: z.string().min(1).optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

/**
 * FLAGGED FOR HAZEM — added during the web-integration pass; no
 * updateVehicleSchema existed before (only createVehicleSchema). `version`
 * is required and passed through to the update action for the optimistic-
 * concurrency check migration 0046 exists for. Note: mobile's own vehicle
 * edit screen (vehicles.tsx) does NOT currently check version on update
 * either — so wiring this into web is holding it to a stricter standard
 * than mobile meets today, not matching existing behavior. Worth deciding
 * whether that's desired now or whether mobile should get the same check
 * first so the two clients behave consistently.
 */
export const updateVehicleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  plate: plateSchema,
  capacity: z.number().int().positive(),
  status: z.enum(['available', 'in_use', 'maintenance']),
  photo_url: z.string().min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

/**
 * Phase 8 (improvement-plan §1.3 step 2) — vehicle_maintenance_log
 * (migration 0073). Append-only — no id/update variant exists because
 * none is needed (see that migration's own Part 3 header).
 */
export const createVehicleMaintenanceLogSchema = z.object({
  vehicle_id: z.string().uuid(),
  log_date: z.string().min(1, 'Date requise.'),
  description: z.string().min(1, 'Description requise.'),
  cost: z.number().positive().optional(),
});
export type CreateVehicleMaintenanceLogInput = z.infer<typeof createVehicleMaintenanceLogSchema>;

/**
 * Phase 8 (improvement-plan §1.3 step 3) — vehicle_documents (migration
 * 0073). Same append-only shape as the maintenance log above — a new
 * recording, never an edit of a prior one.
 */
export const createVehicleDocumentSchema = z.object({
  vehicle_id: z.string().uuid(),
  document_type: z.string().min(1, 'Type de document requis.'),
  document_url: z.string().optional(),
  expires_at: z.string().min(1, "Date d'expiration requise."),
});
export type CreateVehicleDocumentInput = z.infer<typeof createVehicleDocumentSchema>;

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

/**
 * Phase 10 (§4.3) — job_title/hire_date, set from worker/[id].tsx after
 * creation, same as photo_url (migration 0070) which also has no place in
 * inviteWorkerSchema above and is set later from the worker detail screen
 * instead. Kept as its own schema rather than added to inviteWorkerSchema
 * for the same reason photo_url wasn't: these are edited on an EXISTING
 * worker row, not supplied at invite time.
 */
export const updateWorkerProfileSchema = z.object({
  job_title: z.string().optional(),
  hire_date: z.string().optional(), // "YYYY-MM-DD", DatePicker's own value shape
});
export type UpdateWorkerProfileInput = z.infer<typeof updateWorkerProfileSchema>;

/**
 * Doc 02 §2.2a — manual attendance / Pointage. `absence_reason` — Phase 4
 * (improvement-plan §1.1 step 4 / §3) — optional context for an 'absent'
 * status (Maladie/Congé autorisé/Absence non justifiée, or a free-typed
 * "Autre" value via Select.tsx). Not restricted to status='absent' here
 * either — this schema validates a single already-shaped payload, not a
 * cross-field business rule; pointage.tsx itself only ever populates the
 * field when a row is toggled to Absent (see that screen's own header).
 */
export const markAttendanceSchema = z.object({
  worker_id: z.string().uuid(),
  record_date: z.string().date(),
  status: z.enum(['present', 'absent', 'half_day']),
  project_id: z.string().uuid().optional(),
  absence_reason: z.string().optional(),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

/** Doc 02 §2.2a — "Marquer tous présents" bulk action; one round-trip
 *  instead of one insert per worker on the roster. */
export const markAttendanceBulkSchema = z.object({
  entries: z.array(markAttendanceSchema).min(1),
});
export type MarkAttendanceBulkInput = z.infer<typeof markAttendanceBulkSchema>;

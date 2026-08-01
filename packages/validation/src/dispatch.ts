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

/** Doc 03 §3.11 — batch creation for a single vehicle/day with multiple workers. */
export const createDispatchAssignmentsSchema = z.object({
  project_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  worker_ids: z.array(z.string().uuid()).min(1, 'Au moins un ouvrier est requis.'),
  assignment_date: z.string().date(),
  departure_time: z.string().optional(),
  confirmation_channel: z.enum(['app', 'whatsapp']).optional(),
  ignore_vehicle_maintenance: z.boolean().optional(),
  ignore_capacity: z.boolean().optional(),
  ignored_worker_ids: z.array(z.string().uuid()).optional(),
});
export type CreateDispatchAssignmentsInput = z.infer<typeof createDispatchAssignmentsSchema>;

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
export const vehicleStatusEnum = z.enum(['available', 'in_use', 'maintenance']);

export const createVehicleSchema = z.object({
  name: z.string().min(1),
  plate: z.string().optional(),
  capacity: z.number().int().positive().default(1),
  status: vehicleStatusEnum.default('available'),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
/** Doc 03 §3.13.2 — add/invite worker. */
export const inviteWorkerSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().min(8),
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

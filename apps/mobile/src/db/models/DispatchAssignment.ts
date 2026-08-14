import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

/**
 * apps/mobile/src/db/models/DispatchAssignment.ts
 *
 * Doc 03 §3.11 dispatch board — local mirror of the server `dispatch_assignments`
 * table (0006, `updated_at` added 0045). `id` is the same UUID as the
 * Postgres row's `id`, generated client-side with `Crypto.randomUUID()` at
 * creation time (Postgres accepts a client-supplied uuid on insert — the
 * `default gen_random_uuid()` only fires when the column is omitted) — see
 * schema.ts's header for why there's no separate server_id field.
 *
 * `@readonly @date` on created_at/updated_at: these are driven by the sync
 * adapter (pull writes the server's timestamp; push never modifies them
 * locally on create — WatermelonDB's own `_changed`/`_status` machinery
 * tracks the local dirty-state instead), never hand-set from a screen.
 *
 * PHASE 18 REDO — `version` (Doc 01 §1.9 optimistic concurrency) is the
 * REAL conflict mechanism for this table, not the `field_versions`
 * per-field-merge column this model briefly carried earlier this same
 * conversation (built against a stale docx snapshot — see schema.ts's
 * header). `pushChanges.ts` sends this value in a version-checked UPDATE;
 * `conflictResolver.ts` compares it against the pulled server value to
 * detect — never auto-resolve — a genuine concurrent edit.
 */
export default class DispatchAssignment extends Model {
  static table = 'dispatch_assignments';

  @text('org_id') orgId!: string;
  @text('project_id') projectId!: string | null;
  @text('vehicle_id') vehicleId!: string | null;
  @text('worker_id') workerId!: string;
  @text('assignment_date') assignmentDate!: string;
  @text('departure_time') departureTime!: string | null;
  @text('confirmation_channel') confirmationChannel!: string | null;
  @text('actual_departure_time') actualDepartureTime!: string | null;
  @field('version') version!: number;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

import { Model } from '@nozbe/watermelondb';
import { date, readonly, text } from '@nozbe/watermelondb/decorators';

/**
 * apps/mobile/src/db/models/AttendanceRecord.ts
 *
 * Doc 04 attendance/pointage — local mirror of the server `attendance_records`
 * table (0007, `updated_at` added 0045). PHASE 18 REDO: append-only per
 * Doc 01 §1.9 — an offline write here is always a new check-in row, never
 * an update to an existing one, so there is no conflict-resolution concept
 * for this table at all. (This model briefly carried a `field_versions`
 * per-field-merge column earlier this same conversation, built against a
 * stale docx snapshot rather than this repo's own authoritative
 * `docs/spec/` — see schema.ts's header. Removed: nothing to merge on a
 * table that's never updated offline.)
 */
export default class AttendanceRecord extends Model {
  static table = 'attendance_records';

  @text('org_id') orgId!: string;
  @text('worker_id') workerId!: string;
  @text('project_id') projectId!: string | null;
  @text('record_date') recordDate!: string;
  @text('status') status!: string;
  @text('source') source!: string;
  @text('recorded_by') recordedBy!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

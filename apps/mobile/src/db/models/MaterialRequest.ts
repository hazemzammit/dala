import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

/**
 * apps/mobile/src/db/models/MaterialRequest.ts
 *
 * Doc 04 material requests — local mirror of the server `materials` table
 * (0008, `assigned_worker_id` added 0020, `updated_at` added 0045). Named
 * `MaterialRequest` here (not `Material`) to match the engineering brief's
 * vocabulary and avoid confusion with a future physical-inventory concept —
 * `static table` is still the real `materials` table name, which is what
 * actually matters for sync; the class name is local convenience only.
 *
 * PHASE 18 REDO — append-only per Doc 01 §1.9 for the offline creation
 * path (a worker submitting a request); approve/refuse/reassign are plain
 * updates but always performed online by a contractor (confirmed from
 * `materials.tsx`'s own header — no idempotency-key/RPC wrapping was
 * needed for this table since it's not money-moving), so no offline
 * field-merge scenario applies here either. (Briefly carried a
 * `field_versions` column earlier this same conversation — see schema.ts's
 * header for the full correction.)
 */
export default class MaterialRequest extends Model {
  static table = 'materials';

  @text('org_id') orgId!: string;
  @text('project_id') projectId!: string | null;
  @text('item') item!: string;
  @field('quantity') quantity!: number | null;
  @text('urgency') urgency!: string;
  @text('note') note!: string | null;
  @text('status') status!: string;
  @text('rejection_reason') rejectionReason!: string | null;
  @text('created_by') createdBy!: string | null;
  @text('approved_by') approvedBy!: string | null;
  @text('assigned_worker_id') assignedWorkerId!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

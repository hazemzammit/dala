import { Model } from '@nozbe/watermelondb';
import { date, field, text } from '@nozbe/watermelondb/decorators';

/**
 * apps/mobile/src/db/models/DispatchAssignmentConflict.ts
 *
 * Doc 01 §1.9 / Doc 03 §3.11 — Phase 18 redo. Local-only, never synced —
 * see schema.ts's header on this table for the full rationale. Written by
 * `conflictResolver.ts` when it detects a local unsynced edit to a
 * `dispatch_assignments` row whose server `version` has moved past what
 * this device last saw; read by a future Phase 19+ screen to render the
 * dispatch board's "Vos changements / Version du serveur" compare sheet.
 *
 * NOT `@readonly` on any field, unlike the 5 synced models' created_at/
 * updated_at — this table is created through the normal Model API
 * (`.create()` from `conflictResolver.ts`), not through the sync engine's
 * raw `prepareCreateFromRaw` path the other 5 use exclusively. Confirmed
 * by reading `@readonly`'s actual implementation
 * (`decorators/readonly/index.js`): it throws on ANY property-setter
 * assignment, including inside `.create()`, not just `.update()` — marking
 * `detectedAt` readonly here would make this model impossible to create
 * through the API that's actually meant to create it.
 */
export default class DispatchAssignmentConflict extends Model {
  static table = 'dispatch_assignment_conflicts';

  @text('dispatch_assignment_id') dispatchAssignmentId!: string;
  /** JSON-encoded `{ [column]: value }` — only the locally-changed fields. */
  @text('local_snapshot') localSnapshot!: string;
  @field('server_version_at_conflict') serverVersionAtConflict!: number;
  @date('detected_at') detectedAt!: Date;
}

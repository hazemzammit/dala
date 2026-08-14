import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

/**
 * apps/mobile/src/db/models/SiteLog.ts
 *
 * Doc 04 §4.2 site logs — local mirror of the server `site_logs` table
 * (0008, made photo-optional + voice_note_url/note_text/thumbnail_url/
 * idempotency_key/location_lat/location_lng added in 0020, updated_at
 * added in 0045). No `deletedAt`/tombstone field on this model — per
 * schema.ts's header, the offline-delete-before-sync scenario is handled
 * by the upload queue canceling a pending photo upload task, not by a
 * row-level tombstone on this table.
 *
 * PHASE 18 REDO — append-only per Doc 01 §1.9: `submit_site_log_entry()`
 * (the worker's only write path) always inserts under an idempotency key,
 * never updates, so there is no offline field-merge scenario on this
 * table. (Briefly carried a `field_versions` column earlier this same
 * conversation — see schema.ts's header for the full correction.)
 */
export default class SiteLog extends Model {
  static table = 'site_logs';

  @text('org_id') orgId!: string;
  @text('project_id') projectId!: string;
  @text('photo_url') photoUrl!: string | null;
  @text('voice_note_url') voiceNoteUrl!: string | null;
  @text('note_text') noteText!: string | null;
  @text('thumbnail_url') thumbnailUrl!: string | null;
  @text('idempotency_key') idempotencyKey!: string | null;
  @field('location_lat') locationLat!: number | null;
  @field('location_lng') locationLng!: number | null;
  @text('caption') caption!: string | null;
  @text('logged_by') loggedBy!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}

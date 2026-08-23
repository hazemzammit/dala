import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * apps/mobile/src/db/schema.ts
 *
 * Doc 03 §3.3/§3.9 offline-first sync — Phase 17. Local WatermelonDB schema
 * for the five write paths named in scope: dispatch, attendance/check-in,
 * site logs, material requests, advance requests. Column set for each table
 * was read live from the actual migrations (0006/0007/0008, plus the 0020
 * field-ops alters and this phase's own 0045), not assumed — see that
 * migration's header for the full column history per table. Real table
 * names are `advances` and `materials`, not `advance_requests`/
 * `material_requests` (the engineering brief's shorthand) — kept consistent
 * with `@dala/shared-types` naming throughout.
 *
 * WatermelonDB column types are restricted to 'string' | 'number' |
 * 'boolean' (docs/nozbe) — no native date/timestamp type. Convention used
 * throughout this schema:
 *   - Postgres `uuid`/`text`/`date` (YYYY-MM-DD)/`time` (HH:MM:SS) columns
 *     -> WatermelonDB 'string', stored exactly as Postgres would render
 *     them, so no lossy conversion happens in either sync direction.
 *   - Postgres `numeric`/`integer` -> 'number'.
 *   - Postgres `timestamptz` (created_at, updated_at) -> 'number', epoch
 *     milliseconds — WatermelonDB's own convention for its sync protocol,
 *     and required for the adapter's built-in `sortColumns`/comparison
 *     logic. The Phase 18 sync adapter is responsible for the
 *     ISO-string<->epoch-ms conversion at the pull/push boundary; this
 *     schema file only declares the local shape.
 *   - Nullable Postgres columns have no special schema marker — WatermelonDB
 *     columns are nullable by default; NOT NULL is enforced by the model
 *     layer / sync adapter, not the local schema.
 *
 * `isIndexed: true` is set on every column this app actually filters or
 * sorts by today (mirroring the Postgres indexes added alongside each
 * column in the relevant migration) — not added speculatively on every
 * column.
 *
 * PHASE 18 REDO — this file briefly (same conversation) carried a
 * `field_versions` column on all 5 tables, mirroring a server-side
 * per-field-timestamp merge design that turned out to be built against a
 * stale docx snapshot of the cahier des charges, not this repo's own
 * living spec in `docs/spec/` (confirmed authoritative — docx is older).
 * The real design (`docs/spec/01-data-model-security-and-architecture.md`
 * §1.9): `advances`/`attendance_records`/`materials`/`site_logs` are
 * append-only for offline writes — no conflict to resolve, by
 * construction, so no per-field merge machinery is needed on any of them.
 * `dispatch_assignments` is the one genuinely editable-record table among
 * these 5, and needs **optimistic concurrency** (`version`, already
 * present below since Phase 17) with conflicts surfaced to the user
 * explicitly — never auto-merged (§3.11: "This is the one place in the
 * app where an automatic merge is deliberately avoided"). See
 * `dispatch_assignment_conflicts` below, and `src/db/sync/conflictResolver.ts`,
 * for how that's implemented.
 *
 * SCHEMA VERSION LEFT AT 1, deliberately, not bumped to 2: per Phase 17's
 * own db/index.ts header, `database` has never been imported anywhere in
 * the running app, so no real device has ever instantiated a local SQLite
 * file from this schema — there's no installed base to write a
 * `schemaMigrations()` step for. Editing v1 in place is the correct call
 * ONLY because of that specific fact; the moment this schema ships to a
 * single real device, the next schema change must go through a real
 * WatermelonDB migration instead of another in-place edit.
 */
export const schema = appSchema({
  version: 1,
  tables: [
    // Doc 03 §3.11 dispatch board. Server: dispatch_assignments (0006),
    // updated_at added in 0045. `version` is Postgres's real optimistic-
    // concurrency column (Doc 01 §1.9) — NOT the same mechanism as
    // WatermelonDB's own internal `_status`/`_changed` columns (auto-added
    // by the adapter, never declared here). This is the field
    // `pushChanges.ts`'s version-checked update and `conflictResolver.ts`'s
    // conflict detection both key off.
    tableSchema({
      name: 'dispatch_assignments',
      columns: [
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'vehicle_id', type: 'string', isOptional: true },
        { name: 'worker_id', type: 'string', isIndexed: true },
        { name: 'assignment_date', type: 'string', isIndexed: true }, // date, YYYY-MM-DD
        { name: 'departure_time', type: 'string', isOptional: true }, // time, HH:MM:SS
        { name: 'confirmation_channel', type: 'string', isOptional: true }, // 'app'|'whatsapp'|'call'|'sms'
        { name: 'actual_departure_time', type: 'string', isOptional: true },
        { name: 'version', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    // Doc 04 attendance/pointage. Server: attendance_records (0007),
    // updated_at added in 0045, absence_reason added in 0071 (Phase 4
    // §1.1 step 4 / §3). Append-only per Doc 01 §1.9 — an offline write
    // here is always a new row (a check-in event), never an update to an
    // existing one, so there's no merge/conflict concept for this table
    // at all. absence_reason needs no special handling in the sync
    // adapter beyond being declared here — pushChanges.ts's generic
    // upsert path (attendance_records is in GENERIC_UPSERT_TABLES) already
    // spreads every column present on the dirty record through to the
    // Supabase upsert, so a new nullable column flows through automatically.
    tableSchema({
      name: 'attendance_records',
      columns: [
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'worker_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'record_date', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' }, // 'present'|'absent'|'half_day'
        { name: 'source', type: 'string' }, // 'dispatch_checkin'|'manual_pointage'
        { name: 'recorded_by', type: 'string', isOptional: true },
        { name: 'absence_reason', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    // Doc 01 §1.11 money-moving action. Server: advances (0007),
    // updated_at added in 0045. Append-only per Doc 01 §1.9 — creation
    // (create_advance/request_advance) and approval (approve_advance) are
    // both idempotency-keyed RPCs, never a raw client-side UPDATE, so
    // there's no field-level offline-edit-conflict scenario here either.
    // idempotency_key is carried through unchanged (not regenerated
    // locally) so a record created offline and retried on reconnect can
    // never double-post.
    tableSchema({
      name: 'advances',
      columns: [
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'worker_id', type: 'string', isIndexed: true },
        { name: 'amount', type: 'number' },
        { name: 'reason', type: 'string', isOptional: true },
        { name: 'status', type: 'string' }, // 'pending'|'approved'|'rejected'
        { name: 'requested_by', type: 'string', isOptional: true },
        { name: 'approved_by', type: 'string', isOptional: true },
        { name: 'idempotency_key', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    // Doc 04 §4.x material requests. Server table is `materials` (0008,
    // assigned_worker_id added 0020), updated_at added in 0045.
    // Append-only per Doc 01 §1.9 for the offline creation path (worker
    // submitting a request); approve/refuse/reassign are plain
    // RLS-gated updates but always performed online by a contractor
    // (materials.tsx's own header confirms this — no cost/amount field,
    // nothing here moves money, so it was deliberately left off the
    // idempotent-RPC path), so no offline-conflict scenario applies to
    // this table either.
    tableSchema({
      name: 'materials',
      columns: [
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isOptional: true },
        { name: 'item', type: 'string' },
        { name: 'quantity', type: 'number', isOptional: true },
        { name: 'urgency', type: 'string' }, // 'normal'|'urgent'
        { name: 'note', type: 'string', isOptional: true },
        { name: 'status', type: 'string' }, // 'pending'|'approved'|'rejected'
        { name: 'rejection_reason', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isOptional: true },
        { name: 'approved_by', type: 'string', isOptional: true },
        { name: 'assigned_worker_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    // Doc 04 §4.2 site logs — the table with an actual tombstone need at
    // the WatermelonDB *local queue* level (a photo attached offline, then
    // removed offline, before either ever reaches the server). No
    // deleted_at column here, deliberately — see migration 0045's header
    // for why that scenario never touches the server schema. Append-only
    // per Doc 01 §1.9 — submit_site_log_entry() (the worker's only write
    // path) always inserts under an idempotency key, never updates. The
    // `at least one of photo/voice/text` constraint
    // (site_logs_at_least_one_field, 0020) is enforced server-side only;
    // this local schema stores whatever partial state exists so a draft
    // log survives an app restart before it's complete.
    tableSchema({
      name: 'site_logs',
      columns: [
        { name: 'org_id', type: 'string', isIndexed: true },
        { name: 'project_id', type: 'string', isIndexed: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'voice_note_url', type: 'string', isOptional: true },
        { name: 'note_text', type: 'string', isOptional: true },
        { name: 'thumbnail_url', type: 'string', isOptional: true },
        { name: 'idempotency_key', type: 'string', isOptional: true },
        { name: 'location_lat', type: 'number', isOptional: true },
        { name: 'location_lng', type: 'number', isOptional: true },
        { name: 'caption', type: 'string', isOptional: true },
        { name: 'logged_by', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),

    // LOCAL-ONLY — never synced to Postgres, no server-side counterpart.
    // Doc 01 §1.9 / Doc 03 §3.11: when this device has an unsynced local
    // edit to a dispatch_assignments row AND the server's `version` has
    // moved past what this device last saw (someone else edited the same
    // row first), the edit must NOT be silently dropped and must NOT
    // silently win — "the local (unsynced) version is preserved in a
    // 'Vos changements' side-by-side compare sheet." This table IS that
    // preservation mechanism: `conflictResolver.ts` writes a row here
    // instead of losing the local edit when it detects the version
    // mismatch, and lets the synced `dispatch_assignments` row itself
    // settle to the server's value (so sync can complete consistently).
    // A future screen (Phase 19+, the dispatch board's actual "Garder ma
    // version / Utiliser la version du serveur" UI) reads this table to
    // render that compare sheet and resolves it by either deleting the row
    // (server wins) or re-applying `local_snapshot` as a fresh update
    // (local wins, which naturally bumps `version` again on push).
    tableSchema({
      name: 'dispatch_assignment_conflicts',
      columns: [
        { name: 'dispatch_assignment_id', type: 'string', isIndexed: true },
        // JSON-encoded map of the fields the user had actually edited
        // locally, e.g. {"departure_time":"08:30","vehicle_id":"..."} —
        // only the changed fields, not a full row copy, so the compare
        // sheet can highlight exactly what's in contention.
        { name: 'local_snapshot', type: 'string' },
        // The server's `version` at the moment the conflict was detected
        // — shown in the compare sheet, and useful if "use theirs" needs
        // to confirm nothing changed AGAIN between detection and the
        // user's choice.
        { name: 'server_version_at_conflict', type: 'number' },
        { name: 'detected_at', type: 'number' },
      ],
    }),
  ],
});

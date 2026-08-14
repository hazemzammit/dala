-- =============================================================================
-- 0045_offline_sync_updated_at_tracking.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.9
--
-- PHASE 20 CORRECTION (in place, not a follow-up migration) — this header
-- originally cited "docs/spec/03-architecture-apis-and-ops.md §3.3, §3.4,
-- §3.9", a file that does not exist in this repo — Doc 03 is actually
-- "Screens: Mobile Contractor and Worker," and its real §3.4 is unrelated
-- to offline sync. It also described a field-level "expense-edit scenario"
-- merge design ("each field keeps whichever edit has the later updated_at,
-- compared field-by-field") as the planned mechanism for a future phase —
-- that design was later built (briefly, same conversation as this file was
-- originally written) and then explicitly reversed by migration 0046's
-- rewrite once it was recognized as having been built against a stale docx
-- snapshot of the cahier des charges rather than this repo's own living
-- spec in `docs/spec/` (confirmed authoritative — the docx is older). See
-- 0046's own header for the full account. The real design, read directly
-- from `docs/spec/01-data-model-security-and-architecture.md` §1.9: the 4
-- append-only tables this migration touches alongside dispatch_assignments
-- never have a conflict to resolve by construction (an offline write is
-- always an INSERT, never an UPDATE); dispatch_assignments is the one
-- genuinely editable-record table among the 5, and uses optimistic
-- concurrency via its existing `version` column (migration 0006), with
-- conflicts surfaced to the user explicitly, never auto-merged. This
-- correction is applied IN PLACE, not as a follow-up comment block: this
-- migration has never been applied to any real environment in any session
-- (same "never shipped anywhere" status 0046's own header confirmed for
-- itself, checked the same way — this sandbox has never run `supabase db
-- reset` against a live project with 0045 present), so fixing the header
-- now is correcting a mistake before it ever went anywhere, not amending
-- applied history. The substantive SQL below is unchanged by this
-- correction — it only ever added `updated_at` + a trigger + an index to
-- the 5 write-path tables, never any field_versions column itself.
--
-- Phase 17 — prep migration for WatermelonDB offline-first sync (Doc 03
-- §3.3/§3.9 "offline duration: indefinite"). Verified live against every
-- migration up to 0044 (grep, not assumed): none of the five write-path
-- tables this phase targets — dispatch_assignments, attendance_records,
-- advances, materials, site_logs — carry an updated_at column. WatermelonDB's
-- standard pull-changes-since-last-sync protocol needs one on every synced
-- table; without it there is no way to ask Postgres "what changed since I
-- last pulled" other than re-pulling everything, every time.
--
-- NAMING NOTE: the engineering brief referred to "material requests" and
-- "advance requests" — the actual tables are `materials` and `advances`
-- (0007/0008). Using the real names here and in the WatermelonDB models.
--
-- TOMBSTONES, SCOPED OUT OF THIS MIGRATION: Doc 03 §3.4's third scenario
-- ("photo uploaded offline, then deleted offline before either syncs") is
-- about a photo attached to a not-yet-synced site_logs row being removed
-- before it ever reaches the server — that never touches this table, it's
-- purely a local WatermelonDB upload-queue concern (cancel the pending
-- upload task). No deleted_at/tombstone column is added to site_logs here.
-- Verified live (grep across apps/mobile/src): none of these five tables
-- currently have ANY client-facing delete flow for an already-synced row
-- (only a test-fixture teardown deletes organizations, unrelated). If a
-- later phase needs to support deleting an already-synced row offline,
-- that is new scope requiring its own tombstone column + RLS review, not
-- something to silently fold in here.
--
-- set_updated_at() is the existing shared trigger function from 0001 — same
-- pattern already used by organizations (0003) and projects (0006), reused
-- here rather than reinvented.
-- =============================================================================

alter table dispatch_assignments add column updated_at timestamptz not null default now();
create trigger dispatch_assignments_set_updated_at
  before update on dispatch_assignments
  for each row execute function set_updated_at();
create index dispatch_assignments_org_id_updated_at_idx on dispatch_assignments (org_id, updated_at);

alter table attendance_records add column updated_at timestamptz not null default now();
create trigger attendance_records_set_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();
create index attendance_records_org_id_updated_at_idx on attendance_records (org_id, updated_at);

alter table advances add column updated_at timestamptz not null default now();
create trigger advances_set_updated_at
  before update on advances
  for each row execute function set_updated_at();
create index advances_org_id_updated_at_idx on advances (org_id, updated_at);

alter table materials add column updated_at timestamptz not null default now();
create trigger materials_set_updated_at
  before update on materials
  for each row execute function set_updated_at();
create index materials_org_id_updated_at_idx on materials (org_id, updated_at);

alter table site_logs add column updated_at timestamptz not null default now();
create trigger site_logs_set_updated_at
  before update on site_logs
  for each row execute function set_updated_at();
create index site_logs_org_id_updated_at_idx on site_logs (org_id, updated_at);

comment on column dispatch_assignments.updated_at is
  'Doc 03 §3.3/§3.9 offline sync — WatermelonDB pull-changes-since watermark. Not the same field as the pre-existing `version` column, which drives the unrelated non-offline read-before-write conflict check in dispatch.tsx.';
comment on column attendance_records.updated_at is
  'Doc 03 §3.3/§3.9 offline sync — WatermelonDB pull-changes-since watermark.';
comment on column advances.updated_at is
  'Doc 03 §3.3/§3.9 offline sync — WatermelonDB pull-changes-since watermark.';
comment on column materials.updated_at is
  'Doc 03 §3.3/§3.9 offline sync — WatermelonDB pull-changes-since watermark.';
comment on column site_logs.updated_at is
  'Doc 03 §3.3/§3.9 offline sync — WatermelonDB pull-changes-since watermark.';

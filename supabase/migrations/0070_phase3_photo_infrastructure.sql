-- =============================================================================
-- 0070_phase3_photo_infrastructure.sql
-- Ref: DALA_GAPS_AND_FIXES_PLAN.md §11 "Phase 3 — Photo infrastructure",
--      §1.3 item 1, §1.5, §4.1
--
-- Three new columns, one per new photo field this phase wires up. No new
-- RLS policy needed for any of them: `workers`/`vehicles`/`projects` are
-- each already governed by a single `for all` owner/manager write policy
-- (0005, 0006) with no column-specific check, so a new column is covered
-- by the existing policy automatically — same reasoning already used for
-- `vehicles.version` in 0046.
--
-- A FOURTH photo field this phase wires up — `project_expenses.
-- receipt_photo_url` — needs NO migration at all: the column already
-- exists (0007), was simply never written to by any screen. Confirmed by
-- reading 0007 directly before writing this file, rather than assuming
-- from the plan's own "add a receipt photo" framing, which reads as if
-- the column were missing. See docs/PHASE_3_BRIEF.md for the full
-- writeup of what was actually a UI/upload gap, not a schema gap, for
-- that one field.
-- =============================================================================

alter table workers add column photo_url text;

comment on column workers.photo_url is
  'Doc/plan §1.5 — org-facing worker identity photo, storage path (never a public/signed URL directly — Doc 01 §1.3.11). Settable by the org (owner/manager, e.g. from worker/[id].tsx) even before the worker has accepted their invite. See docs/PHASE_3_BRIEF.md for how this relates to profiles.avatar_url once a worker links an account.';

alter table vehicles add column photo_url text;

comment on column vehicles.photo_url is
  'Plan §1.3 item 1 — storage path (never a public/signed URL directly — Doc 01 §1.3.11), same upload pipeline as every other photo field (processPhoto/uploadOrgFile/getSignedUrl).';

alter table projects add column cover_photo_url text;

comment on column projects.cover_photo_url is
  'Plan §1.5 — project cover image, storage path (never a public/signed URL directly — Doc 01 §1.3.11). Optional; project cards fall back to a plain BuildingsIcon tile when unset, same as before this migration.';

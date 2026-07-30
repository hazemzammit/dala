-- =============================================================================
-- 0025_phase5_trash_billing_tier0_digest.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.2, §2.9,
--      §2.9a, §2.10 (Phase 5)
--
-- Doc 01 §1.16/§1.18/§1.19 do not exist in this repo as of this migration
-- (confirmed by reading the current file before writing this one — it stops
-- at §1.13). Built from Doc 02's own prose instead of inventing Doc 01
-- sections that would only be guesses dressed up as spec.
--
-- Five independent things happen in this file, one per part:
--   1. Worker soft-delete (the Trash screen needs both entity types;
--      projects already had this since 0013, workers never did)
--   2. Push token + notification-preferences storage (digest notifications
--      have nowhere to schedule against or send to today)
--   3. Tier 0 pattern-detection RPC (dispatch lateness — Doc 02 §2.2's exact
--      example, "Ahmed is late by an average of 22 minutes on Mondays" —
--      computed live from dispatch_assignments, not a new tracking table;
--      the data already exists, only the surfacing query was missing)
--   4. Digest content RPC (what a daily/weekly digest actually reads)
--   5. Cross-org Shared-layer Storage fix, flagged as a KNOWN GAP in 0024's
--      own header — closed here via a SECURITY DEFINER lookup function
--      rather than a path-convention change, so no existing file needs to
--      be re-uploaded
--
-- CORRECTION re 0019/0020: an earlier pass of this delivery, working from
-- an accidentally-shared stale copy of supabase/migrations, believed
-- 0019_admin_roles_and_sessions.sql and 0020_announcements.sql existed as
-- byte-identical duplicates of 0021/0022 and deleted them. A fresh copy of
-- supabase/migrations was then provided and diffed directly against what
-- this delivery had: those two duplicate files do NOT exist in the real
-- repo — only 0019_worker_self_access_and_payroll_rpcs.sql and
-- 0020_field_ops_worker_self_access_and_client_portal.sql occupy those
-- numbers, both already correct. Nothing needs deleting. This migration's
-- numbering (0025, following the real 0024) is unaffected either way.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — Worker soft-delete (Doc 02 §2.10 "project/worker Trash screen")
-- ---------------------------------------------------------------------------
-- Same shape as projects.deleted_at (0006) / soft_delete_project (0013) —
-- reusing the established pattern rather than inventing a status enum.
-- RLS: no new policy needed. "workers_write_owner_manager" (0005) is a
-- `for all` policy, so it already covers the UPDATE that soft_delete_worker/
-- restore_worker perform.

alter table workers add column deleted_at timestamptz;

comment on column workers.deleted_at is
  'Doc 02 §2.10 — 30-day recoverable soft-delete, same pattern as projects.deleted_at (0013).';

create or replace view active_workers as
  select * from workers where deleted_at is null;

create or replace function soft_delete_worker(p_worker_id uuid)
returns void language sql as $$
  update workers set deleted_at = now() where id = p_worker_id;
$$;

create or replace function restore_worker(p_worker_id uuid)
returns void language sql as $$
  update workers set deleted_at = null
  where id = p_worker_id and deleted_at > now() - interval '30 days';
$$;

grant execute on function soft_delete_worker(uuid) to authenticated;
grant execute on function restore_worker(uuid) to authenticated;

-- purge_soft_deleted_records() (0013) only ever purged projects. Extending
-- it to also purge workers past the same 30-day window, since both now show
-- on the same Trash screen and should be governed by one scheduled job
-- rather than adding a second one for a single extra table.
--
-- organizations.deleted_at (added in 0021 for Platform Admin) is
-- deliberately NOT added here — that soft-delete belongs to Doc 04's admin
-- lifecycle, which is out of scope for this mobile-only phase, and nothing
-- in Doc 02's Phase 5 text asks for an org-trash surface on mobile.
create or replace function purge_soft_deleted_records()
returns integer language plpgsql as $$
declare
  purged_count integer;
  workers_purged integer;
begin
  delete from projects where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics purged_count = row_count;

  delete from workers where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics workers_purged = row_count;

  return purged_count + workers_purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- Part 2 — Push token + notification preferences
-- (Doc 02 §2.9a digest notifications; Doc 03 §3.23 "push toggles per
-- category")
-- ---------------------------------------------------------------------------
-- Per-account, not per-org (activeOrg.ts / myOrgs.ts checked before writing
-- this): a digest is "what does this person need to know across their day,"
-- which shouldn't reset if they switch active org mid-session. profiles
-- already restricts writes to id = auth.uid() (Doc 01 §1.5), so no new RLS
-- policy is needed for a user to set their own token/prefs.

alter table profiles add column expo_push_token text;
alter table profiles add column notification_prefs jsonb not null default jsonb_build_object(
  'dispatch', true,
  'advances', true,
  'materials', true,
  'safety', true,
  'digest_frequency', 'off'
);

comment on column profiles.expo_push_token is
  'Doc 02 §2.9a — Expo push token, set once notification permission is granted. Null until the user has granted permission at least once.';
comment on column profiles.notification_prefs is
  'Doc 03 §3.23 per-category push toggles + digest_frequency (''off''|''daily''|''weekly''), Doc 02 §2.9a. jsonb rather than five separate columns: this is always read/written as one unit from Settings, and nothing in this schema needs to filter rows by an individual key at the DB layer.';

-- ---------------------------------------------------------------------------
-- Part 3 — Tier 0 pattern detection: dispatch lateness (Doc 02 §2.2, §2.9)
-- ---------------------------------------------------------------------------
-- "After ~3 months of data, the app surfaces rule-based patterns" is a
-- display-worthiness bar, not a hard SQL cutoff — this returns whatever it
-- can compute and lets the caller (the Worker Detail screen) decide whether
-- there's enough to show. Computed live from dispatch_assignments; no new
-- tracking table, since this data is already being recorded and only the
-- surfacing query was the gap.

create or replace function get_worker_lateness_pattern(p_worker_id uuid)
returns table (
  day_of_week       integer,   -- 0 = Sunday .. 6 = Saturday (extract(dow))
  avg_lateness_min  numeric,
  sample_count      bigint
)
language sql
security definer
set search_path = public
as $$
  select
    extract(dow from assignment_date)::integer as day_of_week,
    round(avg(extract(epoch from (actual_departure_time - departure_time)) / 60), 1) as avg_lateness_min,
    count(*) as sample_count
  from dispatch_assignments
  where worker_id = p_worker_id
    and departure_time is not null
    and actual_departure_time is not null
    and is_org_member(org_id)
  group by extract(dow from assignment_date)
  having count(*) >= 4
  order by avg_lateness_min desc;
$$;

grant execute on function get_worker_lateness_pattern(uuid) to authenticated;

comment on function get_worker_lateness_pattern(uuid) is
  'Doc 02 §2.2/§2.9 Tier 0 — deterministic SQL, no ML. security definer only to let is_org_member() evaluate before returning rows (same reasoning as other cross-table RPCs in this repo, e.g. 0018''s invite_worker) — still gated by is_org_member(org_id) in the WHERE clause, never open to an arbitrary worker_id. min 4 samples/day-of-week so one noisy data point never reads as "a pattern".';

-- ---------------------------------------------------------------------------
-- Part 4 — Digest content RPC (Doc 02 §2.9a)
-- ---------------------------------------------------------------------------
-- What a daily/weekly digest actually reads, per Doc 02 §2.9a's exact list:
-- pending advance/material request counts, whether tomorrow's dispatch is
-- planned, and the week's running advances total. One RPC rather than three
-- round trips, since the scheduled Edge Function needs all of it together
-- per org anyway.

create or replace function get_digest_summary(p_org_id uuid)
returns table (
  pending_advances_count    bigint,
  pending_materials_count   bigint,
  tomorrow_dispatch_planned boolean,
  week_advances_total       numeric
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from advances where org_id = p_org_id and status = 'pending'),
    (select count(*) from materials where org_id = p_org_id and status = 'pending'),
    exists (
      select 1 from dispatch_assignments
      where org_id = p_org_id and assignment_date = (current_date + interval '1 day')::date
    ),
    coalesce((
      select sum(amount) from advances
      where org_id = p_org_id and status = 'approved'
        and created_at >= date_trunc('week', now())
    ), 0)
  where is_org_member(p_org_id);
$$;

grant execute on function get_digest_summary(uuid) to authenticated;

comment on function get_digest_summary(uuid) is
  'Doc 02 §2.9a — backs the scheduled digest Edge Function (service role, iterates every org with notification_prefs.digest_frequency != ''off''). security definer + is_org_member() in the WHERE clause: returns zero rows rather than an error for a non-member, the same "quiet no-op" shape as other read RPCs in this repo.';

-- ---------------------------------------------------------------------------
-- Part 5 — Cross-org Shared-layer Storage fix (KNOWN GAP flagged in 0024)
-- ---------------------------------------------------------------------------
-- 0024 documented this rather than half-implementing it: a cross-org
-- project member can read a shared site_logs ROW but not its photo/voice
-- attachment, because org-files paths are {org_id}/{category}/{file} and
-- the existing storage.objects policies only check
-- is_org_participant(org_id) — a member of a DIFFERENT org has no path in.
--
-- Changing the path convention (adding a project_id segment) would require
-- re-uploading every file already in the bucket — a bigger migration than
-- this pass affords. Instead: an additive SELECT policy that checks whether
-- the requested path is actually referenced by a site_logs row the caller
-- can already see via is_project_member() — reusing the existing
-- site_logs_select_project_shared policy's logic (0024) as the source of
-- truth for "can this caller see this row," rather than re-deriving it here.

create index if not exists site_logs_photo_url_idx on site_logs (photo_url) where photo_url is not null;
create index if not exists site_logs_voice_note_url_idx on site_logs (voice_note_url) where voice_note_url is not null;
create index if not exists site_logs_thumbnail_url_idx on site_logs (thumbnail_url) where thumbnail_url is not null;

create or replace function is_shared_site_log_file(p_path text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from site_logs
    where (photo_url = p_path or voice_note_url = p_path or thumbnail_url = p_path)
      and is_project_member(project_id)
  );
$$;

comment on function is_shared_site_log_file(text) is
  'Closes the KNOWN GAP documented in 0024''s header: lets a cross-org project member read the photo/voice attachment of a site_logs row they can already read via is_project_member(), without changing the org-files path convention or requiring existing files to be re-uploaded under a new path shape.';

create policy "org_files_select_shared_project_member" on storage.objects
  for select using (bucket_id = 'org-files' and is_shared_site_log_file(name));

-- =============================================================================
-- 0108_worker_directory_masked_rate.sql
--
-- Closes the last piece of option B (viewer money-blind, 0103/0107):
-- workers.daily_rate is a per-row PAY figure living as a column inside the
-- `workers` table, which also holds operational data (name, phone, trade)
-- that viewers legitimately need for the roster. Unlike advances/salary_
-- cycles/materials (separate money tables/columns), viewer vs. owner/manager
-- is the SAME Postgres role (`authenticated`), so a column GRANT/REVOKE
-- cannot vary by row — and neither can it distinguish "a worker reading their
-- OWN rate" (legitimate, salary.tsx) from "a viewer reading a COLLEAGUE's
-- rate" (not legitimate). Both need per-row logic, which only a view or
-- function provides.
--
-- APPROACH — additive, not a replacement of `workers`:
--   Renaming/replacing `workers` with a masking view was tested and rejected:
--   every FK to `workers` (attendance_records, dispatch_assignments, ...)
--   auto-follows a rename to the renamed base relation, so PostgREST's
--   automatic relationship detection for embedded queries like
--   `.from('dispatch_assignments').select('*, workers(full_name)')` (used in
--   apps/mobile dashboard.tsx and dispatch.tsx) would silently break —
--   confirmed by reproducing the rename against a real database and
--   inspecting pg_constraint. `workers` itself, its columns, and every
--   existing foreign key are therefore left completely untouched here.
--
--   Instead: two new views, additive only. App code that lists/displays
--   workers (not the 2 embed sites above, which never request daily_rate)
--   is repointed to these in the same change that ships this migration; any
--   read site NOT repointed keeps seeing the table's real (unmasked) value,
--   same as before this migration — a superset improvement with zero
--   regression risk for legitimate owner/manager/self reads.
--
--   worker_directory         — every worker row, daily_rate masked per row.
--   active_worker_directory  — same, filtered to deleted_at is null (the
--                              drop-in replacement for the existing
--                              `active_workers` view).
--
--   Masking rule: daily_rate is visible if the caller is owner/manager of the
--   worker's org, OR the row is the caller's own worker record (workers.
--   user_id = auth.uid()) — a worker must still see their own pay
--   (apps/mobile (worker)/salary.tsx and others). Otherwise NULL.
--
--   Column shape matches `workers`/`active_workers` exactly (same names, same
--   order, `daily_rate` still called `daily_rate`) so it's a drop-in `.from()`
--   replacement wherever an app read is repointed — no column renames on the
--   caller's side.
-- =============================================================================

drop view if exists public.active_worker_directory;
drop view if exists public.worker_directory;

create view public.worker_directory as
select
  id, org_id, full_name, phone, trade, user_id, created_at, email, deleted_at,
  photo_url, job_title, hire_date, search_vector,
  case
    when coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
      or user_id = auth.uid()
    then daily_rate
  end as daily_rate
from public.workers;

alter view public.worker_directory set (security_invoker = true);
revoke all on public.worker_directory from anon;
grant select on public.worker_directory to authenticated;

create view public.active_worker_directory as
select * from public.worker_directory where deleted_at is null;

alter view public.active_worker_directory set (security_invoker = true);
revoke all on public.active_worker_directory from anon;
grant select on public.active_worker_directory to authenticated;

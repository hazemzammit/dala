-- =============================================================================
-- 0109_material_requests_masked_cost.sql
--
-- Continuation of 0103/0107/0108 (viewer money-blind, option B): materials.cost
-- is the last remaining money figure a viewer could read. Same structural
-- problem as workers.daily_rate (0108) — the materials/"Matériaux" request-
-- and-approval workflow is operational (item/quantity/status/urgency must
-- stay visible to viewers), but `cost` is filled in only at approval time by
-- an owner/manager, and viewer vs. owner/manager is the SAME Postgres role
-- (`authenticated`), so a plain column GRANT/REVOKE cannot vary by row.
--
-- No embedding risk here (unlike workers): nothing in the app selects
-- `materials(...)` as an embedded resource from another table, so there is no
-- FK-following hazard to test for — this is a simpler case than 0108.
--
-- material_requests_directory — every materials row, `cost` masked to NULL
-- unless the caller is owner/manager of the row's org. Column shape matches
-- `materials` exactly, so it's a drop-in `.from()` replacement for reads.
-- Writes (insert/update/delete) are untouched — they still target `materials`
-- directly, unaffected by a SELECT-only masking view.
-- =============================================================================

drop view if exists public.material_requests_directory;

create view public.material_requests_directory as
select
  id, org_id, project_id, item, quantity, urgency, note, status,
  rejection_reason, created_by, approved_by, created_at, assigned_worker_id,
  updated_at,
  case
    when coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    then cost
  end as cost
from public.materials;

alter view public.material_requests_directory set (security_invoker = true);
revoke all on public.material_requests_directory from anon;
grant select on public.material_requests_directory to authenticated;

-- =============================================================================
-- 0107_viewer_money_blind_maintenance_log.sql
--
-- Continuation of 0103 (viewer money-blind, option B).
--
-- vehicle_maintenance_log is a whole table of vehicle spend history with no
-- operational reason for a viewer to read it, so it gets the same table-level
-- SELECT swap as advances/salary_cycles/project_expenses in 0103.
--
-- NOTE: materials.cost is NOT fixed here. It is a single COLUMN inside the
-- otherwise-operational materials table (item/quantity/status must stay
-- visible to viewers), and viewer vs. owner/manager are the SAME Postgres
-- role (`authenticated`) — a plain column GRANT cannot vary by row, so it
-- needs a view or a split table, exactly like workers.daily_rate. Treat it as
-- part of that same follow-up, not a quick column revoke (which would hide
-- it from EVERYONE, breaking the approval screen).
-- =============================================================================

drop policy if exists vehicle_maintenance_log_select_member on public.vehicle_maintenance_log;
create policy vehicle_maintenance_log_select_owner_manager on public.vehicle_maintenance_log
  for select to public
  using (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'));

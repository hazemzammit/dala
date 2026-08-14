-- =============================================================================
-- 0035_dispatch_assignments_project_participation.sql
--
-- Closes the gap flagged in 0034_project_workers.sql's header: nothing
-- previously stopped dispatch_assignments.project_id from being set to a
-- project the assigning org has no real association with at all —
-- dispatch_assignments_write_owner_manager only ever checked
-- `org_role_of(org_id)`, never whether that org is actually the project's
-- lead or an invited trade participant.
--
-- Uses is_project_participant() (defined in 0034 — covers lead orgs, which
-- is_project_member() alone does NOT, since no code path ever creates a
-- lead-role project_memberships row; see 0034's header for the full
-- explanation of that separate, more severe bug this fix avoids repeating).
--
-- `project_id IS NULL` stays unconditionally allowed — "Sans véhicule"/
-- no-project dispatch (maintenance runs, unassigned trips) is a real,
-- existing use case in dispatch.tsx and must keep working exactly as
-- before. Only a NON-null project_id now requires real participation.
--
-- Split into three targeted policies (insert/update/delete) instead of
-- extending the old single `for all` policy, because the right check
-- genuinely differs by operation:
--   - INSERT: must be a real participant on whatever project_id is being
--     set, if any.
--   - UPDATE: same check on the (possibly new) project_id, since the app
--     could in principle change it even though today's UI never exposes
--     that (dispatch.tsx hides the "Chantier" picker once `editing` is
--     set — see its own header). RLS should be correct independent of
--     what the current UI happens to allow.
--   - DELETE: deliberately NOT gated by project participation. An org
--     that created an assignment and was later removed from the project
--     (or the project's own trade-participant list changed) must still
--     be able to delete/cancel its own assignment — losing project
--     access shouldn't strand a stale row only that org can see (its own
--     SELECT policy, is_org_member(org_id), is unaffected by any of
--     this and still shows it to them) but can no longer act on.
--
-- Read access is untouched — dispatch_assignments_select_member
-- (is_org_member(org_id) only, unrelated to project participation) is not
-- part of this migration and keeps working exactly as before, including
-- for the RLS matrix suite's existing assertions about it.
-- =============================================================================

drop policy if exists "dispatch_assignments_write_owner_manager" on dispatch_assignments;

create policy "dispatch_assignments_insert_owner_manager" on dispatch_assignments
  for insert
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and (project_id is null or is_project_participant(project_id))
  );

create policy "dispatch_assignments_update_owner_manager" on dispatch_assignments
  for update
  using (org_role_of(org_id) in ('owner', 'manager'))
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and (project_id is null or is_project_participant(project_id))
  );

create policy "dispatch_assignments_delete_owner_manager" on dispatch_assignments
  for delete
  using (org_role_of(org_id) in ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- seed.sql sanity note (not enforced by this migration, checked manually
-- while writing it): its dispatch_assignments rows for org 1 reference
-- project 1 (org 1 is that project's lead_org_id — is_project_participant
-- covers this via the lead-org branch) and project 2 (org 1 is again the
-- lead there, per seed.sql's own project_memberships insert for the
-- multi-org demo). Both pass the new check. Nothing in seed.sql needs to
-- change for this migration.
-- ---------------------------------------------------------------------------

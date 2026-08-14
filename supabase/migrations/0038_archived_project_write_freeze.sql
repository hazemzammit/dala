-- =============================================================================
-- 0038_archived_project_write_freeze.sql
--
-- Closes disclosed gap (a) from Phase 13: both Dispatch's Phase-11 readOnly
-- retrofit and Équipe's Phase-13 archived lock (Doc 00 §0.5 #26) are
-- client-side only — nothing in RLS ever checked `projects.status` for
-- writes to `dispatch_assignments` or `project_workers`. Same shape of gap
-- on both tables, fixed together in one migration rather than two ad-hoc
-- ones, per this phase's instruction.
--
-- One new predicate, following this codebase's existing convention
-- (Doc 01 §1.5 — a table-lookup predicate function, never a hand-rolled
-- check inline):
create or replace function is_project_active(target_project uuid)
returns boolean language sql stable as $$
  select coalesce(
    (select status = 'active' from projects where id = target_project),
    false
  );
$$;

comment on function is_project_active(uuid) is
  'RLS predicate: is this project''s status = ''active''? Used to freeze '
  'staffing (project_workers) and dispatch (dispatch_assignments) writes '
  'once a project is archived/completed, per Doc 00 §0.5 #26/#28. Returns '
  'false (fails closed) if target_project doesn''t resolve to a row at all.';

-- ---------------------------------------------------------------------------
-- project_workers — was a single `for all` policy
-- (project_workers_write_owner_manager, 0034). Split into insert/update/
-- delete, same reasoning 0035 used for dispatch_assignments: the right
-- check genuinely differs by operation.
--
-- INSERT (adding a worker to the roster) and UPDATE (removing one — this
-- app soft-deletes via `removed_at`, never a hard DELETE — see
-- project-roster.tsx) both now additionally require `is_project_active()`.
-- This freezes BOTH directions the Phase-13 client-side lock already hid
-- in the UI: `canWrite` was gating the "+ Ajouter" FAB (insert) AND
-- "Retirer" (update-as-soft-delete) alike, so the server-side check must
-- cover both to actually close the gap, not just one half of it.
--
-- DELETE is deliberately left as it was (org_role_of + is_project_participant,
-- no active-status check) — this app never issues a hard delete against
-- project_workers (soft-delete via `removed_at` is the only removal path
-- in every screen that touches this table), so there is no real write this
-- policy is currently guarding differently from before; changing it would
-- be a no-op for anything the app actually does today, and speculatively
-- tightening an unused path isn't this migration's job.
-- ---------------------------------------------------------------------------
drop policy if exists "project_workers_write_owner_manager" on project_workers;

create policy "project_workers_insert_owner_manager" on project_workers
  for insert
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
    and is_project_active(project_id)
  );

create policy "project_workers_update_owner_manager" on project_workers
  for update
  using (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
  )
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
    and is_project_active(project_id)
  );

create policy "project_workers_delete_owner_manager" on project_workers
  for delete
  using (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
  );

-- ---------------------------------------------------------------------------
-- dispatch_assignments — 0035 already split this into insert/update/delete
-- for the project-participation check; this migration adds the
-- active-status check alongside it, same `project_id is null or (...)`
-- shape so unassigned/maintenance dispatch (project_id null) stays
-- unconditionally allowed, exactly as 0035 established.
--
-- DELETE stays ungated by project status, same reasoning 0035 already
-- documented for participation: an org that created an assignment must
-- still be able to cancel/delete it even after the project's status
-- changes out from under it (e.g. archived mid-week) — losing write
-- access to *new* dispatch on a finished project shouldn't strand an
-- existing row only that org can see but can no longer act on.
-- ---------------------------------------------------------------------------
drop policy if exists "dispatch_assignments_insert_owner_manager" on dispatch_assignments;
drop policy if exists "dispatch_assignments_update_owner_manager" on dispatch_assignments;

create policy "dispatch_assignments_insert_owner_manager" on dispatch_assignments
  for insert
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and (
      project_id is null
      or (is_project_participant(project_id) and is_project_active(project_id))
    )
  );

create policy "dispatch_assignments_update_owner_manager" on dispatch_assignments
  for update
  using (org_role_of(org_id) in ('owner', 'manager'))
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and (
      project_id is null
      or (is_project_participant(project_id) and is_project_active(project_id))
    )
  );

-- dispatch_assignments_delete_owner_manager (0035) is untouched — no
-- `drop`/`create` needed, it already has no project-status dependency.

-- ---------------------------------------------------------------------------
-- seed_project_worker_from_dispatch (0034) needs no change: it only ever
-- fires as an AFTER INSERT trigger on dispatch_assignments, and that insert
-- itself is now rejected by RLS above whenever it targets a non-active
-- project — so the trigger simply never runs for that case, same as it
-- already never runs when the dispatching org isn't a real participant
-- (0034's own guard). No redundant check needed inside the trigger body.
-- =============================================================================

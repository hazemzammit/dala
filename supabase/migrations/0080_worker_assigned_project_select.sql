-- =============================================================================
-- 0080_worker_assigned_project_select.sql
--
-- Closes a real, currently-shipping display bug in
-- apps/mobile/src/app/(worker)/material-request.tsx and
-- apps/mobile/src/app/(worker)/update-chantier.tsx. Both screens do:
--   .from('dispatch_assignments').select('project_id, projects(name)')
--     .eq('worker_id', worker.id).eq('assignment_date', today)
-- The outer `dispatch_assignments` row resolves fine under
-- `dispatch_assignments_select_self` (0019, `is_own_worker(worker_id)`),
-- but the embedded `projects(name)` does not: `projects` has exactly one
-- SELECT policy, `projects_select_lead_or_trade` (0006) —
--   is_org_member(lead_org_id) or is_project_member(id)
-- — and both predicates check organization_members/project_memberships,
-- tables a worker's auth user is never a row in (workers authenticate as
-- their own linked profile, not as an org member — see is_own_worker's own
-- comment, 0019). So the embed silently returns null for every worker,
-- every time; this is not an edge case.
--
-- The consequence is worse than a blank field: both screens do
-- `projectName ?? null` and then render either "Pour {projectName}" or
-- "Aucun chantier assigné aujourd'hui" — so a worker who IS assigned to a
-- site today is actively told they have no site assigned. Confirmed by
-- reading both screens' render logic, not assumed from the query alone.
--
-- Fix: a narrow, additive SELECT policy on `projects` (Postgres OR's
-- multiple permissive policies on the same command together, so this
-- can't reduce what projects_select_lead_or_trade already allows) using a
-- new predicate function, is_worker_assigned_to_project(), following the
-- same "table-lookup function, never a hand-rolled check" rule as every
-- other predicate in this schema (0005's header). Not scoped to "today
-- only" — once a worker has ever been dispatched to a project, seeing
-- that project's own name is not sensitive (every trade-org member on the
-- project already sees it in full), and this schema doesn't time-scope
-- comparable membership predicates elsewhere (is_project_member,
-- is_org_member) either.
--
-- Deliberately a full RLS policy, not a SECURITY DEFINER RPC like 0078/
-- 0079: those two returned a narrowed CROSS-ORG field subset for a
-- genuinely different org's row. This is a same-org worker reading a
-- single non-sensitive column (name) of a project their own org already
-- fully exposes to org members — the plain RLS shape this schema uses
-- everywhere else for that case.

create or replace function is_worker_assigned_to_project(target_project uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from dispatch_assignments da
    join workers w on w.id = da.worker_id
    where w.user_id = auth.uid()
      and da.project_id = target_project
  );
$$;

comment on function is_worker_assigned_to_project(uuid) is
  'RLS predicate: has the current user (as a worker, via workers.user_id — never an org member check) ever had a dispatch_assignments row on this project? Table-lookup, same pattern as is_own_worker/is_org_member. Used to let a worker read their own assigned project''s name, which projects_select_lead_or_trade (0006) does not cover for a worker session.';

create policy "projects_select_assigned_worker" on projects
  for select using (is_worker_assigned_to_project(id));

comment on policy "projects_select_assigned_worker" on projects is
  'Fixes silent null-name bug in material-request.tsx/update-chantier.tsx (see this migration''s header) — a worker session satisfies neither is_org_member nor is_project_member, so without this, a worker dispatched to a project today could never actually see that project''s name via the projects(name) embed those screens rely on.';

grant execute on function is_worker_assigned_to_project(uuid) to authenticated;

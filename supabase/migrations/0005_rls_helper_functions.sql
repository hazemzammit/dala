-- =============================================================================
-- 0005_rls_helper_functions.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- *** THE single authorization pattern for this entire product. ***
-- Every RLS policy, on every table, forever, uses one of these three
-- functions. JWT custom claims are NEVER read by any RLS policy, anywhere,
-- for any purpose (Doc 01 §1.5.1) — membership changes must take effect on
-- the very next request, not whenever a token happens to refresh.
--
-- If you find yourself writing a hand-rolled membership check instead of
-- calling one of these, stop — that is the bug this file exists to prevent.
-- =============================================================================

create or replace function is_org_member(target_org uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from organization_members
    where org_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function org_role_of(target_org uuid)
returns text language sql stable as $$
  select role from organization_members
  where org_id = target_org and user_id = auth.uid();
$$;

-- NOTE: is_project_member() is NOT defined here. It references
-- project_memberships, which doesn't exist until 0006_projects_dispatch_vehicles.sql.
-- `language sql` functions are parsed and validated against the catalog at
-- CREATE FUNCTION time (unlike plpgsql, whose body is opaque text checked only
-- at first call) — so defining it here, before the table exists, fails
-- immediately with "relation does not exist". It's defined in 0006 instead,
-- right after project_memberships is created.

comment on function is_org_member(uuid) is
  'RLS predicate: does the current user belong to this org, in any role? Table-lookup, never JWT claims.';
comment on function org_role_of(uuid) is
  'RLS predicate: current user''s role (owner/manager/viewer) in this org, or NULL if not a member.';

-- Enable RLS + the standard "members of the org can read" policy on the
-- tables already created. Every later migration follows this exact shape:
--   1. enable row level security
--   2. one policy per operation (select/insert/update/delete), each using
--      is_org_member() / org_role_of() / is_project_member() — never anything else.

alter table profiles enable row level security;
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

alter table password_reset_audit enable row level security;
-- No client-side policies at all: this table is written/read only by
-- server-side (service-role) code, never directly by a mobile/web client.

alter table organizations enable row level security;
create policy "organizations_select_member" on organizations
  for select using (is_org_member(id));
create policy "organizations_update_owner_manager" on organizations
  for update using (org_role_of(id) in ('owner', 'manager'));
create policy "organizations_insert_authenticated" on organizations
  for insert with check (created_by = auth.uid());
create policy "organizations_delete_owner" on organizations
  for delete using (org_role_of(id) = 'owner');

alter table organization_members enable row level security;
create policy "organization_members_select_fellow_member" on organization_members
  for select using (is_org_member(org_id));
create policy "organization_members_write_owner" on organization_members
  for all using (org_role_of(org_id) = 'owner');

alter table workers enable row level security;
create policy "workers_select_member" on workers
  for select using (is_org_member(org_id));
create policy "workers_write_owner_manager" on workers
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table worker_invitations enable row level security;
create policy "worker_invitations_select_member" on worker_invitations
  for select using (
    is_org_member((select org_id from workers where workers.id = worker_invitations.worker_id))
  );
create policy "worker_invitations_write_owner_manager" on worker_invitations
  for all using (
    org_role_of((select org_id from workers where workers.id = worker_invitations.worker_id)) in ('owner', 'manager')
  );

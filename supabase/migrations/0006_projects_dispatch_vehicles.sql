-- =============================================================================
-- 0006_projects_dispatch_vehicles.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.2, §2.8
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.9 (version column)
-- =============================================================================

create table projects (
  id               uuid primary key default gen_random_uuid(),
  lead_org_id      uuid not null references organizations(id) on delete cascade,
  name             text not null,
  client_name      text,
  address          text,
  budget_total     numeric(12, 2),
  status           text not null default 'active' check (status in ('active', 'completed', 'archived')),
  deleted_at       timestamptz,             -- soft delete, Doc 01 §1.16
  version          integer not null default 1,   -- optimistic concurrency, Doc 01 §1.9
  created_by       uuid not null references profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

create index projects_lead_org_id_idx on projects (lead_org_id);

alter table projects add column search_vector tsvector
  generated always as (
    to_tsvector('french', coalesce(name, '') || ' ' || coalesce(client_name, '') || ' ' || coalesce(address, ''))
  ) stored;
create index projects_search_idx on projects using gin (search_vector);

-- Multi-org collaboration: which orgs are on a project, and in what role.
-- Doc 02 §2.8 — 'lead' owns the project, 'trade' was invited on, 'client' is
-- the client-portal-only view.
create table project_memberships (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  role         text not null check (role in ('lead', 'trade', 'client')),
  budget_rollup_opt_in boolean not null default false,  -- Doc 00 §0.5 item 3, off by default
  created_at   timestamptz not null default now(),
  unique (project_id, org_id)
);

create index project_memberships_project_id_org_id_idx on project_memberships (project_id, org_id);

-- Moved here from 0005_rls_helper_functions.sql: `language sql` functions are
-- validated against the catalog at CREATE FUNCTION time, so this can only be
-- defined once project_memberships exists.
create or replace function is_project_member(target_project uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from project_memberships pm
    join organization_members om on om.org_id = pm.org_id
    where pm.project_id = target_project and om.user_id = auth.uid()
  );
$$;

comment on function is_project_member(uuid) is
  'RLS predicate: does the current user''s org have a membership on this project (lead or trade)?';

create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  plate       text,
  capacity    integer not null default 1,
  status      text not null default 'available' check (status in ('available', 'in_use', 'maintenance')),
  created_at  timestamptz not null default now()
);

create index vehicles_org_id_idx on vehicles (org_id);

alter table vehicles add column search_vector tsvector
  generated always as (to_tsvector('french', coalesce(name, '') || ' ' || coalesce(plate, ''))) stored;
create index vehicles_search_idx on vehicles using gin (search_vector);

create table dispatch_assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  project_id      uuid references projects(id),
  vehicle_id      uuid references vehicles(id),
  worker_id       uuid not null references workers(id),
  assignment_date date not null,
  departure_time  time,
  confirmation_channel text check (confirmation_channel in ('app', 'whatsapp', 'call', 'sms')),
  actual_departure_time time,
  version         integer not null default 1,   -- optimistic concurrency, Doc 01 §1.9
  created_at      timestamptz not null default now()
);

create index dispatch_assignments_org_id_date_idx on dispatch_assignments (org_id, assignment_date);
create index dispatch_assignments_worker_id_date_idx on dispatch_assignments (worker_id, assignment_date);

-- RLS
alter table projects enable row level security;
create policy "projects_select_lead_or_trade" on projects
  for select using (is_org_member(lead_org_id) or is_project_member(id));
create policy "projects_write_owner_manager" on projects
  for all using (org_role_of(lead_org_id) in ('owner', 'manager'));

alter table project_memberships enable row level security;
create policy "project_memberships_select_member" on project_memberships
  for select using (is_org_member(org_id) or is_project_member(project_id));
create policy "project_memberships_write_lead_owner_manager" on project_memberships
  for all using (
    org_role_of((select lead_org_id from projects where projects.id = project_memberships.project_id)) in ('owner', 'manager')
  );

alter table vehicles enable row level security;
create policy "vehicles_select_member" on vehicles for select using (is_org_member(org_id));
create policy "vehicles_write_owner_manager" on vehicles for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table dispatch_assignments enable row level security;
create policy "dispatch_assignments_select_member" on dispatch_assignments
  for select using (is_org_member(org_id));
create policy "dispatch_assignments_write_owner_manager" on dispatch_assignments
  for all using (org_role_of(org_id) in ('owner', 'manager'));

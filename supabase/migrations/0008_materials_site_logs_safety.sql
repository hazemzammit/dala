-- =============================================================================
-- 0008_materials_site_logs_safety.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.4, §2.5, §2.6
-- =============================================================================

create table materials (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid references projects(id),
  item         text not null,
  quantity     numeric(10, 2),
  urgency      text not null default 'normal' check (urgency in ('normal', 'urgent')),
  note         text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_by   uuid references profiles(id),   -- worker who requested it, if worker-side
  approved_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index materials_org_id_idx on materials (org_id);
create index materials_project_id_idx on materials (project_id);

create table site_logs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  photo_url    text not null,        -- compressed client-side before upload, Doc 02 §2.5
  caption      text,
  logged_by    uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index site_logs_project_id_idx on site_logs (project_id, created_at desc);

create table safety_incidents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid references projects(id),
  description  text not null,
  severity     text not null check (severity in ('minor', 'moderate', 'severe')),
  photo_url    text,
  reported_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index safety_incidents_org_id_idx on safety_incidents (org_id);

create table org_insurances (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  provider_name text not null,
  policy_number text,
  document_url  text,
  expires_at    date,
  created_at    timestamptz not null default now()
);

create index org_insurances_org_id_idx on org_insurances (org_id);

-- RLS
alter table materials enable row level security;
create policy "materials_select_member" on materials for select using (is_org_member(org_id));
create policy "materials_write_owner_manager" on materials
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table site_logs enable row level security;
create policy "site_logs_select_member" on site_logs for select using (is_org_member(org_id));
create policy "site_logs_insert_member" on site_logs for insert with check (is_org_member(org_id));

alter table safety_incidents enable row level security;
create policy "safety_incidents_select_member" on safety_incidents for select using (is_org_member(org_id));
create policy "safety_incidents_write_owner_manager" on safety_incidents
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table org_insurances enable row level security;
create policy "org_insurances_select_member" on org_insurances for select using (is_org_member(org_id));
create policy "org_insurances_write_owner" on org_insurances
  for all using (org_role_of(org_id) = 'owner');

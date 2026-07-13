-- =============================================================================
-- 0007_attendance_advances_expenses.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.2a, §2.2b, §2.3
-- Append-only tables per Doc 01 §1.9.1 — offline conflicts are impossible by
-- construction because a write is always an INSERT, never an UPDATE.
-- =============================================================================

create table attendance_records (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  worker_id    uuid not null references workers(id),
  project_id   uuid references projects(id),
  record_date  date not null,
  status       text not null check (status in ('present', 'absent', 'half_day')),
  source       text not null check (source in ('dispatch_checkin', 'manual_pointage')),
  recorded_by  uuid references profiles(id),   -- null if written by the worker's own check-in
  created_at   timestamptz not null default now()
);

-- A manually-marked entry is never silently overwritten by a later dispatch
-- check-in for the same worker/day (Doc 01 §1.14.3) — enforced by keeping
-- both rows and having the read side prefer 'manual_pointage' on conflict,
-- not by a unique constraint that would reject the second insert.
create index attendance_records_org_id_date_idx on attendance_records (org_id, record_date);
create index attendance_records_worker_id_date_idx on attendance_records (worker_id, record_date);

create table advances (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  worker_id    uuid not null references workers(id),
  amount       numeric(10, 2) not null check (amount > 0),
  reason       text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references profiles(id),   -- worker's own account, if self-requested
  approved_by  uuid references profiles(id),
  idempotency_key uuid,                        -- Doc 01 §1.11 — money-moving action
  created_at   timestamptz not null default now()
);

create index advances_org_id_idx on advances (org_id);
create index advances_worker_id_idx on advances (worker_id);

create table project_expenses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  category     text not null check (category in ('materiaux', 'carburant', 'sous_traitance', 'autre')),
  amount       numeric(10, 2) not null check (amount > 0),
  description  text,
  receipt_photo_url text,
  expense_date date not null default current_date,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now()
);

comment on table project_expenses is
  'Consumed % = SUM(project_expenses) / projects.budget_total. Worker payroll/advances are deliberately excluded to avoid double-counting (Doc 01 §1.14.2).';

create index project_expenses_project_id_idx on project_expenses (project_id);

-- Salary cycles: weekly rollup status, not a computed table — the actual
-- numbers are always derived live from attendance_records + advances so
-- there is never a second source of truth to drift out of sync.
create table salary_cycles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  worker_id     uuid not null references workers(id),
  cycle_start   date not null,
  cycle_end     date not null,
  status        text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at       timestamptz,
  idempotency_key uuid,                        -- Doc 01 §1.11 — "mark cycle as paid"
  created_at    timestamptz not null default now(),
  unique (org_id, worker_id, cycle_start)
);

create index salary_cycles_org_id_idx on salary_cycles (org_id);

-- RLS
alter table attendance_records enable row level security;
create policy "attendance_records_select_member" on attendance_records
  for select using (is_org_member(org_id));
create policy "attendance_records_insert_member" on attendance_records
  for insert with check (is_org_member(org_id));

alter table advances enable row level security;
create policy "advances_select_member" on advances for select using (is_org_member(org_id));
create policy "advances_write_owner_manager" on advances
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table project_expenses enable row level security;
create policy "project_expenses_select_member" on project_expenses
  for select using (is_org_member(org_id));
create policy "project_expenses_write_owner_manager" on project_expenses
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table salary_cycles enable row level security;
create policy "salary_cycles_select_member" on salary_cycles for select using (is_org_member(org_id));
create policy "salary_cycles_write_owner_manager" on salary_cycles
  for all using (org_role_of(org_id) in ('owner', 'manager'));

-- =============================================================================
-- 0020_ppe_and_risk_alerts.sql
-- Ref: Safety module mock UI (PPE Checklist, Risk Alerts) — not described
-- in the cahier des charges §6, only present as placeholder cards in the
-- pre-existing UI mock. Schema below is a reasonable minimal design,
-- flagged for Hazem to confirm/refine rather than treated as final.
-- =============================================================================

create table ppe_checklists (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid references projects(id),
  item         text not null,
  compliant    boolean not null default true,
  checked_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index ppe_checklists_org_id_idx on ppe_checklists (org_id);

create table risk_alerts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid references projects(id),
  description  text not null,
  severity     text not null check (severity in ('low', 'medium', 'high')),
  status       text not null default 'open' check (status in ('open', 'resolved')),
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index risk_alerts_org_id_idx on risk_alerts (org_id);

-- RLS — same shape as safety_incidents (migration 0008): read for any org
-- member, write for owner/manager.
alter table ppe_checklists enable row level security;
create policy "ppe_checklists_select_member" on ppe_checklists for select using (is_org_member(org_id));
create policy "ppe_checklists_write_owner_manager" on ppe_checklists
  for all using (org_role_of(org_id) in ('owner', 'manager'));

alter table risk_alerts enable row level security;
create policy "risk_alerts_select_member" on risk_alerts for select using (is_org_member(org_id));
create policy "risk_alerts_write_owner_manager" on risk_alerts
  for all using (org_role_of(org_id) in ('owner', 'manager'));

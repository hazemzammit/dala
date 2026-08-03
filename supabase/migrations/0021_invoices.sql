-- =============================================================================
-- 0021_invoices.sql
-- Ref: docs/spec/06-besoins-fonctionnels.md §6.3 (facturation client)
--
-- Génération de vrais PDF (voir @react-pdf/renderer côté web), mais pas
-- d'intégration de paiement en ligne réelle (Konnect/Flouci non câblés dans
-- ce projet) — le statut 'paid' est marqué manuellement par le contractant,
-- pas confirmé automatiquement par un webhook de paiement.
-- =============================================================================

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  invoice_number text not null,
  client_name    text not null,
  amount         numeric(10, 2) not null check (amount > 0),
  status         text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'overdue')),
  due_date       date not null,
  paid_at        timestamptz,
  created_by     uuid not null references profiles(id),
  created_at     timestamptz not null default now(),
  unique (org_id, invoice_number)
);

create index invoices_org_id_idx on invoices (org_id);
create index invoices_project_id_idx on invoices (project_id);

alter table invoices enable row level security;
create policy "invoices_select_member" on invoices for select using (is_org_member(org_id));
create policy "invoices_write_owner_manager" on invoices
  for all using (org_role_of(org_id) in ('owner', 'manager'));

-- =============================================================================
-- 0003_organizations.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.2, §1.3.13
-- =============================================================================

create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  trade_type        text,                    -- 'plomberie' | 'électricité' | 'vacuum_central' | ...
  logo_url          text,
  address           text,
  contact_phone     text,
  contact_email     text,
  matricule_fiscal  text,                    -- Tunisian tax ID — nullable, collected post-signup
  rc_number         text,                    -- Registre de Commerce number
  plan              text not null default 'free',
  org_checklist_dismissed_at timestamptz,   -- §1.3.13 "Complétez le profil de votre entreprise"
  created_by        uuid not null references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create table organization_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null check (role in ('owner', 'manager', 'viewer')),
  joined_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Reverse-direction index: "which orgs does this user belong to" — read on
-- every login and every org-switcher render (Doc 01 §1.5.4).
create index organization_members_user_id_idx on organization_members (user_id);

-- Now that organizations exists, wire up the deferred FK on profiles.
alter table profiles
  add constraint profiles_active_org_id_fkey
  foreign key (active_org_id) references organizations(id);

-- Full-text search vector, Doc 01 §1.12 (French default locale, Doc 00 §0.6).
alter table organizations add column search_vector tsvector
  generated always as (
    to_tsvector('french', coalesce(name, '') || ' ' || coalesce(trade_type, ''))
  ) stored;
create index organizations_search_idx on organizations using gin (search_vector);

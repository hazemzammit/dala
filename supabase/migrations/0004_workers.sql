-- =============================================================================
-- 0004_workers.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.2, §1.3.4
-- =============================================================================

create table workers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  full_name   text not null,
  phone       text,
  trade       text,
  daily_rate  numeric(10, 2),
  user_id     uuid references profiles(id),  -- set once the worker accepts an invite
  created_at  timestamptz not null default now()
);

create index workers_org_id_idx on workers (org_id);

alter table workers add column search_vector tsvector
  generated always as (
    to_tsvector('french', coalesce(full_name, '') || ' ' || coalesce(trade, ''))
  ) stored;
create index workers_search_idx on workers using gin (search_vector);

create table worker_invitations (
  id           uuid primary key default gen_random_uuid(),
  worker_id    uuid not null references workers(id) on delete cascade,
  token        text not null unique,
  channel      text not null check (channel in ('app', 'whatsapp', 'sms')),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  sent_at      timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz
);

create index worker_invitations_worker_id_idx on worker_invitations (worker_id);

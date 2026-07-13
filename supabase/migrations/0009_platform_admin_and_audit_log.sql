-- =============================================================================
-- 0009_platform_admin_and_audit_log.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.2, §1.3.10
-- Deliberately NOT a role inside organization_members — a platform admin is
-- not a member of any tenant org (Doc 01 §1.2).
-- =============================================================================

create table platform_admins (
  id            uuid primary key references auth.users(id),
  full_name     text not null,
  totp_enabled  boolean not null default false,
  allowed_ips   text[],
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles(id),
  actor_type    text not null default 'user' check (actor_type in ('user', 'platform_admin', 'system')),
  action        text not null,          -- e.g. 'org.delete', 'member.role_change', 'admin.impersonate_start'
  target_table  text,
  target_id     uuid,
  metadata      jsonb,
  -- impersonation-specific fields, Doc 04 §4.3.3a
  impersonated_user_id uuid references profiles(id),
  impersonation_reason text,
  created_at    timestamptz not null default now()
);

create index audit_log_actor_id_idx on audit_log (actor_id);
create index audit_log_target_idx on audit_log (target_table, target_id);
create index audit_log_created_at_idx on audit_log (created_at desc);

-- RLS: platform_admins and audit_log are never queried directly by mobile/web
-- clients — only by the Admin app (which authenticates separately, Doc 01
-- §1.3.10) through service-role/edge-function access. No client-facing
-- policies are defined; RLS is enabled so a misconfigured anon/authenticated
-- grant can never accidentally expose these tables.
alter table platform_admins enable row level security;
alter table audit_log enable row level security;

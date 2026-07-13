-- =============================================================================
-- 0002_profiles_and_auth.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.2, §1.3
-- One row per human, mirrors auth.users. Plus the password-reset audit trail
-- required by the email+password auth rework (v4.0 decision, Doc 00 §0.5 item 4).
-- =============================================================================

create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  full_name            text not null,
  phone                text unique,
  email_verified_at    timestamptz,                     -- NULL until verification link confirmed
  preferred_locale     text not null default 'fr' check (preferred_locale in ('fr', 'ar', 'en')),
  avatar_url           text,
  active_org_id        uuid,                             -- FK added in 0003 after organizations exists
  profile_checklist_dismissed_at timestamptz,           -- §1.3.12 "Complétez votre profil" dismissal
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz,
  last_login_platform  text check (last_login_platform in ('mobile', 'web'))
);

comment on table profiles is 'Application-level extension of auth.users. Never stores password data — Supabase Auth owns that entirely.';

create table password_reset_audit (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  ip_address    inet,
  platform      text check (platform in ('mobile', 'web')),
  unique (user_id, requested_at)
);

comment on table password_reset_audit is
  'Security-relevant audit trail for password resets. Repeated resets on one account is a fraud/account-takeover signal. Doc 01 §1.3.7.';

-- A brand-new auth.users row automatically gets a profiles row.
-- full_name is pulled from the signup metadata payload the client sends to
-- supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } }).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Lightweight, unauthenticated health-check RPC used by the keep-alive
-- GitHub Action (Doc 01 §1.10) so a quiet week never auto-pauses the project.
create or replace function health_check()
returns boolean language sql stable as $$
  select true;
$$;

grant execute on function health_check() to anon;

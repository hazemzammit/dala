-- =============================================================================
-- 0011_app_versions.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.8
-- =============================================================================

create table app_versions (
  platform              text primary key check (platform in ('ios', 'android')),
  latest_version        text not null,
  min_supported_version text not null,
  updated_at            timestamptz not null default now()
);

insert into app_versions (platform, latest_version, min_supported_version) values
  ('ios', '1.0.0', '1.0.0'),
  ('android', '1.0.0', '1.0.0');

-- Unauthenticated RPC — checked once per cold start, before any session logic
-- runs (Doc 03 §3.1a). Must not require login.
create or replace function app_version_check(p_platform text, p_build text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'latest_version', latest_version,
    'min_supported_version', min_supported_version,
    'force_update', p_build < min_supported_version
  )
  from app_versions where platform = p_platform;
$$;

grant execute on function app_version_check(text, text) to anon;

alter table app_versions enable row level security;
create policy "app_versions_select_anyone" on app_versions for select using (true);
-- Writes only via Platform Admin (service role) — no client write policy.

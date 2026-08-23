-- =============================================================================
-- 0068_feature_flags.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.13
--
-- Admin remediation Tier 4.10 — feature flags / gradual rollout.
-- SCOPE DECISION, made explicitly per the plan's own instruction not to
-- build this reactively: per-org BOOLEAN flags only, no percentage-based
-- rollout bucketing. The plan itself frames this as the right starting
-- shape ("you can always add percentage rollout later without a breaking
-- change to the table shape") — a later `rollout_percentage` column plus
-- a seeded-random-bucket check against organizations.id could be added
-- to this same table shape without migrating existing data, so starting
-- simple here isn't closing off that option.
--
-- EXPLICITLY NOT TOUCHED: migration 0044's free-tier downgrade
-- enforcement (RESTRICTIVE RLS policies gating project/worker counts by
-- subscription_status). That's billing-tier enforcement, a different
-- (and, per 0044's own header, arguably more appropriate) mechanism than
-- a general feature flag — this system is for genuinely experimental/
-- rollout features, not billing logic, per the plan's own explicit
-- instruction not to unify them as part of this task.
-- =============================================================================

create table feature_flags (
  key               text primary key,
  description       text not null,
  default_enabled   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table organization_feature_flags (
  org_id      uuid not null references organizations(id) on delete cascade,
  flag_key    text not null references feature_flags(key) on delete cascade,
  enabled     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, flag_key)
);

alter table feature_flags enable row level security;
alter table organization_feature_flags enable row level security;

-- feature_flags: readable by any authenticated user (mobile/web feature
-- code needs to read flag state for its own org — see
-- get_feature_flag() below, the actual intended read path), writable
-- only by service_role (apps/admin's own routes).
revoke all on feature_flags from public, anon;
grant select on feature_flags to authenticated;
grant select, insert, update, delete on feature_flags to service_role;

-- organization_feature_flags: no direct authenticated access at all —
-- org members read their OWN org's overrides only through
-- get_feature_flag() below (security definer, scoped to the org_id
-- passed in), not by querying this table directly, so there's no need
-- for a per-org RLS policy here at all.
revoke all on organization_feature_flags from public, anon, authenticated;
grant select, insert, update, delete on organization_feature_flags to service_role;

create or replace function get_feature_flag(p_org_id uuid, p_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select enabled from organization_feature_flags where org_id = p_org_id and flag_key = p_key),
    (select default_enabled from feature_flags where key = p_key),
    false
  );
$$;

-- Granted to authenticated (not just service_role) — this is the actual
-- intended read path from mobile/web feature code once something needs
-- to gate on a flag (checked per the plan's own instruction before
-- deciding this needed RLS-exposure at all: nothing in this codebase
-- consumes a flag yet, but the whole point of this item is giving
-- mobile/web app code a real place to check one when a feature needs it,
-- not just an admin-only toggle with no consumer).
revoke all on function get_feature_flag(uuid, text) from public, anon;
grant execute on function get_feature_flag(uuid, text) to authenticated, service_role;

comment on function get_feature_flag(uuid, text) is
  'Doc 01 §1.13 / admin remediation Tier 4.10. Per-org override takes
   precedence over the flag''s default_enabled; an unknown flag key
   returns false rather than erroring, so calling code never needs a
   null-check just to gate a feature.';

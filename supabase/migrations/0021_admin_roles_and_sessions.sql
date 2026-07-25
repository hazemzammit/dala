-- =============================================================================
-- 0021_admin_roles_and_sessions.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.10
--      docs/spec/04-screens-web-contractor-and-admin.md §4.3, §4.3.1, §4.3.3a, §4.3.11
--
-- 0009_platform_admin_and_audit_log.sql created `platform_admins` and
-- `audit_log` but left three things the Platform Admin app can't work
-- without: an admin role (Super Admin / Admin / Support, §4.3 intro),
-- somewhere to store a TOTP secret (§4.3.1 requires mandatory TOTP; the
-- prior migration only tracked `totp_enabled`, not the secret itself),
-- and a session model distinct from the regular 30-day user session
-- (§1.3.10 — 2-hour expiry, admin-only).
--
-- As with 0009: no client-facing RLS policies are added for any of this.
-- Every table here is written/read exclusively by apps/admin's server-side
-- route handlers using the service-role key. RLS stays enabled purely as a
-- backstop against a misconfigured anon/authenticated grant.
-- =============================================================================

alter table platform_admins
  add column role text not null default 'support'
    check (role in ('super_admin', 'admin', 'support'));

comment on column platform_admins.role is
  'super_admin: full access incl. managing other admins, raw SQL, org deletion.
   admin: everything except managing admins, raw SQL, deleting orgs.
   support: read-only + impersonation, password resets. No data/billing changes.
   Doc 04 §4.3 intro.';

-- TOTP secret. Stored as text here for MVP; production hardening should move
-- this behind Supabase Vault the same way CIN encryption does (Doc 01
-- §1.3.11) so the raw secret never lives in a plain column — flagged in the
-- admin build guide as a follow-up, not silently assumed to be "done."
alter table platform_admins
  add column totp_secret text;

comment on column platform_admins.totp_secret is
  'Base32 TOTP secret. TODO(security): move behind Supabase Vault before
   production launch, matching the CIN-encryption pattern (Doc 01 §1.3.11).
   Never sent to any client — read only by server-side route handlers.';

-- Admin's own session table. Deliberately NOT Supabase Auth's session /
-- refresh-token cookie, which is the regular-user 30-day model (Doc 01
-- §1.3.10 is explicit this is unaffected/separate). A row here IS an admin
-- session; the cookie apps/admin sets is just an opaque pointer to this row
-- (see apps/admin/src/lib/admin-session for the signing/verification code).
create table admin_sessions (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid not null references platform_admins(id) on delete cascade,
  created_at     timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at     timestamptz not null, -- created_at + 2h, hard cap, never extended
  revoked_at     timestamptz,          -- explicit logout / forced revoke

  -- Impersonation state, Doc 04 §4.3.3a. Nesting is forbidden: the app must
  -- check impersonating_user_id IS NULL before allowing a new impersonation
  -- to start on this session.
  impersonating_user_id    uuid references profiles(id),
  impersonation_reason     text,
  impersonation_started_at timestamptz,
  impersonation_expires_at timestamptz, -- min(15 min idle, 2h hard cap) from start
  impersonation_urgent     boolean not null default false -- delays owner notification 24h instead of suppressing it (§4.3.3a step 6)
);

create index admin_sessions_admin_id_idx on admin_sessions (admin_id);

alter table admin_sessions enable row level security;
-- No client policies: service-role / server-side route handlers only.

-- -----------------------------------------------------------------------------
-- Two-admin approval for Database Explorer write-path actions (Doc 04 §4.3.5).
-- Only relevant once a team has 2+ admins; a lone admin's write actions are
-- expected to be blocked entirely by the UI until a second admin exists.
-- -----------------------------------------------------------------------------
create table admin_approval_requests (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid not null references platform_admins(id),
  sql_statement text not null,
  reason        text not null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed')),
  approved_by   uuid references platform_admins(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

alter table admin_approval_requests enable row level security;

comment on table admin_approval_requests is
  'Doc 04 §4.3.5 — any INSERT/UPDATE/DELETE from the Database Explorer requires
   a second admin''s approval before execution when the team has 2+ admins.';

-- -----------------------------------------------------------------------------
-- Doc 04 §4.3.3 (Organizations: Suspend, Soft-delete) and §4.3.4 (Users:
-- Suspend) need columns that don't exist yet. 0013_soft_delete.sql only ever
-- added `deleted_at` to `projects` — `organizations` and `profiles` have
-- neither a suspend flag nor a soft-delete column. Adding both here rather
-- than inventing a status enum, to match the existing `deleted_at` pattern
-- other tables already use.
-- -----------------------------------------------------------------------------
alter table organizations add column suspended_at timestamptz;
alter table organizations add column deleted_at timestamptz;

alter table profiles add column suspended_at timestamptz;

comment on column organizations.suspended_at is
  'Doc 04 §4.3.3 — soft block: login blocked while set, no data deleted. Set/cleared only via the Admin app.';
comment on column organizations.deleted_at is
  'Doc 04 §4.3.3 — 30-day recoverable soft-delete, same pattern as projects.deleted_at (0013).';
comment on column profiles.suspended_at is
  'Doc 04 §4.3.4 — per-user login block, independent of any org-level suspension.';

create or replace function soft_delete_organization(p_org_id uuid)
returns void language sql as $$
  update organizations set deleted_at = now() where id = p_org_id;
$$;

create or replace function restore_organization(p_org_id uuid)
returns void language sql as $$
  update organizations set deleted_at = null
  where id = p_org_id and deleted_at > now() - interval '30 days';
$$;

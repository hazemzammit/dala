-- =============================================================================
-- 0104_admin_explorer_readonly_role.sql
--
-- Audit finding (admin console): the Database Explorer's read path (/query,
-- open to every admin role, including `support`) executed on the same
-- connection string as the danger zone — a superuser-equivalent role. The
-- keyword classifier and the READ ONLY transaction added earlier stop writes,
-- but nothing at the DATABASE level stopped a support admin from reading the
-- Vault (RIB + TOTP encryption keys), Supabase Auth (password hashes, MFA
-- secrets) or the admin credential tables — a regex is not a boundary.
--
-- This migration creates the real boundary: a least-privilege role for that
-- path, and a login role to connect as it.
--
--   admin_explorer_ro     NOLOGIN group role. Reads (never writes) every table
--                         in `public` EXCEPT the credential tables below, and
--                         only the non-secret COLUMNS of tables that mix them.
--                         BYPASSRLS, because cross-tenant reads are the whole
--                         point of a support tool. No access to the vault,
--                         auth, storage or extensions schemas, and no EXECUTE
--                         on the app's SECURITY DEFINER RPCs (0100 revoked them
--                         from PUBLIC), so RPC-wrapped writes are impossible too.
--                         Defaults: read-only transactions, 10s statement
--                         timeout, 5 connections.
--   admin_explorer_login  LOGIN member of the group, also BYPASSRLS (an attribute
--                         is not inherited via membership). It is created
--                         WITHOUT a password: set one out-of-band (see below).
--
-- Fail-closed by design: tables/columns created LATER are NOT readable until a
-- migration grants them (no default privileges) — a new secret column can't
-- leak by default.
--
-- OPERATIONS (once per environment, as the postgres/owner role):
--   alter role admin_explorer_login with password '<long random>';
--   -- then set DATABASE_URL_EXPLORER_RO for apps/admin, e.g.
--   -- postgresql://admin_explorer_login:<password>@<host>:5432/postgres
-- apps/admin refuses to serve /query in production until that variable is set.
--
-- If the migration role may not create BYPASSRLS roles (managed platforms
-- differ) the role is created without it and a NOTICE is raised: the explorer
-- then sees RLS-filtered rows only — safe, but not useful for support. Fix by
-- creating the role with BYPASSRLS as a platform superuser.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'admin_explorer_ro') then
    begin
      create role admin_explorer_ro nologin bypassrls;
    exception when insufficient_privilege then
      raise notice 'cannot create admin_explorer_ro with BYPASSRLS here; creating without (explorer will see RLS-filtered rows only)';
      create role admin_explorer_ro nologin;
    end;
  end if;
  -- BYPASSRLS is a role ATTRIBUTE, not a privilege: it is NOT inherited through
  -- group membership, so the login role needs it itself.
  if not exists (select 1 from pg_roles where rolname = 'admin_explorer_login') then
    begin
      create role admin_explorer_login login inherit bypassrls connection limit 5;
    exception when insufficient_privilege then
      raise notice 'cannot create admin_explorer_login with BYPASSRLS here; creating without';
      create role admin_explorer_login login inherit connection limit 5;
    end;
  end if;
end $$;

grant admin_explorer_ro to admin_explorer_login;

alter role admin_explorer_ro set default_transaction_read_only = on;
alter role admin_explorer_ro set statement_timeout = '10s';
alter role admin_explorer_ro set idle_in_transaction_session_timeout = '15s';
alter role admin_explorer_login set default_transaction_read_only = on;
alter role admin_explorer_login set statement_timeout = '10s';
alter role admin_explorer_login set idle_in_transaction_session_timeout = '15s';

-- Schema access: `public` only. Nothing on auth / vault / storage / extensions.
grant usage on schema public to admin_explorer_ro;

-- Table/column grants -----------------------------------------------------------
do $$
declare
  t record;
  v_cols text;
  v_all boolean;
  -- Tables that are credentials or credential-adjacent: never readable.
  v_blocked constant text[] := array[
    'platform_admins', 'admin_sessions', 'mfa_recovery_codes',
    'totp_encryption_key_state', 'totp_key_rotation_log',
    'edge_function_rate_limits', 'idempotency_keys',
    'password_reset_audit', 'phone_change_requests'
  ];
  -- Columns that hold secrets/tokens/hashes in otherwise readable tables
  -- (organizations.rib_encrypted, profiles.expo_push_token,
  --  client_portals.link_token / PIN hash, ...).
  v_secret_col constant text := '(secret|password|token|encrypt|pin_hash|totp|recovery|hash)';
begin
  revoke all on all tables in schema public from admin_explorer_ro;

  for t in
    select c.oid, c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm')
      and c.relname <> all (v_blocked)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
           bool_and(a.attname !~* v_secret_col)
      into v_cols, v_all
    from pg_attribute a
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
      and a.attname !~* v_secret_col;

    if v_cols is null then continue; end if;

    -- any secret column present? then grant column-level only.
    if exists (
      select 1 from pg_attribute a
      where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
        and a.attname ~* v_secret_col
    ) then
      execute format('grant select (%s) on public.%I to admin_explorer_ro', v_cols, t.relname);
    else
      execute format('grant select on public.%I to admin_explorer_ro', t.relname);
    end if;
  end loop;
end $$;

-- Deliberately NO `alter default privileges`: new tables stay unreadable until a
-- migration grants them (fail closed).

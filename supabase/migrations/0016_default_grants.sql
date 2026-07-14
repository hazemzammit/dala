-- =============================================================================
-- 0016_default_grants.sql
--
-- Fixes a real gap found in local testing: every table so far only had RLS
-- policies, never a base table-level GRANT. Postgres checks table-level
-- privileges BEFORE it ever evaluates a row-level security policy — RLS
-- narrows which rows are visible/writable, it doesn't substitute for the
-- underlying GRANT. Without this migration, every insert/select from
-- `authenticated` or `service_role` fails with `permission denied` (42501),
-- regardless of how correct the RLS policy is.
--
-- `anon` deliberately gets nothing here: this product has no publicly
-- readable table (unlike, say, a blog). The few anon-safe operations
-- (health_check, app_version_check) are exposed as SECURITY DEFINER
-- functions with their own explicit `grant execute ... to anon`
-- (migrations 0002, 0011) — table access stays fully closed for anon.
--
-- Function-level grants are NOT handled here on purpose: find_user_id_by_email
-- (migration 0015) is deliberately restricted to service_role only, and a
-- blanket `grant execute on all functions` here would silently undo that.
-- Every function's access is granted explicitly, at the point it's created.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;

-- So the next migration's new table doesn't silently reintroduce this same
-- bug — any table created from here on gets these grants automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- =============================================================================
-- 0015_email_lookup_rpc.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.7
--
-- The forgot-password Edge Function needs to check whether an email belongs
-- to an existing account WITHOUT revealing that to the caller (Doc 01
-- §1.3.7 step 2 — same generic response either way). auth.users isn't
-- reachable from a normal client role, and email isn't duplicated onto
-- profiles, so this narrow, service-role-only lookup is the function that
-- makes the check possible without exposing an enumeration oracle to
-- authenticated/anon roles.
-- =============================================================================

create or replace function find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where email = p_email limit 1;
$$;

comment on function find_user_id_by_email(text) is
  'service_role only. Used exclusively by the forgot-password Edge Function to decide whether to send a reset email — never exposed to anon/authenticated, which would turn it into an account-enumeration oracle.';

revoke all on function find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function find_user_id_by_email(text) to service_role;

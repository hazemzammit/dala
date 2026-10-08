-- =============================================================================
-- 0100_revoke_anon_execute_default_deny.sql
--
-- Audit finding (RPC exposure). Postgres grants EXECUTE on every new function
-- to PUBLIC by default, and Supabase additionally grants it to anon via default
-- privileges. The migrations never revoked that, so in the intended production
-- setup 33 SECURITY DEFINER and 26 invoker functions were callable with no
-- login at all — including money/portal/role RPCs (approve_advance,
-- mark_salary_cycle_paid, generate_client_portal_link, set_client_portal_pin,
-- create_advance, ...). Most re-check auth.uid()/roles and refuse an anonymous
-- caller today, but that is exactly the layer that failed open in 0093; an
-- unauthenticated caller should never reach it in the first place.
--
-- This migration flips the default to DENY:
--   1. For every public function EXCEPT the allowlist below, EXECUTE is revoked
--      from PUBLIC and anon. authenticated and service_role KEEP exactly the
--      access they effectively had: where it came only from PUBLIC, it is first
--      converted into an explicit grant.
--   2. Default privileges are changed so functions created by FUTURE migrations
--      are no longer anon/PUBLIC-executable unless a migration grants it.
--   3. supabase/tests/lint_anon_execute_allowlist.sql (run in CI) fails if a
--      function outside the allowlist becomes anon-executable again.
--
-- ALLOWLIST (must match the lint file):
--   pre-login by design: token-based invitation lookups, client-portal
--     verification, org logo URL, app_version_check, health_check
--   pure predicates used inside RLS policies that are declared TO public
--     (is_org_member, org_role_of, is_project_member, is_own_worker,
--      is_org_participant, is_project_active, is_project_participant,
--      is_worker_assigned_to_project, is_org_past_due, capacity/seat helpers)
--     — kept so anonymous queries keep returning "no rows" instead of erroring.
--   Trigger functions are never RPC-callable and are left untouched.
-- =============================================================================

do $$
declare
  f record;
  v_allow constant text[] := array[
    'get_organization_member_invitation_by_token',
    'get_project_invitation_by_token',
    'get_worker_invitation_by_token',
    'verify_client_portal_access',
    'verify_client_portal_invoice',
    'get_org_logo_signed_url',
    'app_version_check',
    'health_check',
    'is_org_member', 'org_role_of', 'is_project_member', 'is_own_worker',
    'is_org_participant', 'is_project_active', 'is_project_participant',
    'is_worker_assigned_to_project', 'is_org_past_due',
    'has_active_project_capacity', 'has_active_worker_capacity', 'get_org_seat_count'
  ];
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and not (p.proname = any (v_allow))
  loop
    -- Preserve current effective access before PUBLIC is removed.
    if has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Future functions: no implicit anon/PUBLIC access. (authenticated/service_role
-- default grants from the platform are left as they are.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

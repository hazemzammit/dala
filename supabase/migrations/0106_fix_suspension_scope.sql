-- =============================================================================
-- 0106_fix_suspension_scope.sql
--
-- Audit finding (flagged "Potential" in the original report, now confirmed
-- live): check_suspension_before_token_issuance() — the custom Auth Hook that
-- runs on every token issuance — got organisation suspension scope wrong in
-- BOTH directions.
--
-- 1. TOO BROAD: it LEFT JOINed across every organization_members row for the
--    user and blocked the token if ANY of them belonged to a suspended org.
--    Reproduced: a user who is, say, owner of org A (active) and manager of
--    org B (suspended for non-payment) could not log in AT ALL — including to
--    use org A, which has nothing to do with org B's suspension.
--
-- 2. TOO NARROW: the join only covers organization_members. A worker-only
--    account (workers.user_id, no organization_members row — the normal
--    shape for a field worker who never gets an office-app login role) in a
--    suspended org was not blocked at all. Reproduced live: a worker of a
--    suspended org could sign in without restriction.
--
-- Fix: block token issuance only when the user has NO usable way in —
--   * profiles.suspended_at is set (a platform-level ban: always blocks,
--     regardless of any organisation), OR
--   * the user has at least one organisation link (member OR worker) AND
--     every single one of those organisations is suspended.
-- A user linked to at least one non-suspended organisation can always sign
-- in, whatever the state of their other organisations. A brand-new user with
-- no organisation link yet is unaffected either way (as before).
--
-- Org-level suspension still has no effect INSIDE an active session for a
-- still-usable account beyond this login gate (no RLS policy reads
-- organizations.suspended_at) — narrowing this gate does not create that gap,
-- it already existed identically before this migration for a user with at
-- least one active org. Enforcing suspension inside a session (e.g. blocking
-- writes scoped to the suspended org specifically) is a separate, larger
-- change, not made here.
-- =============================================================================

create or replace function public.check_suspension_before_token_issuance(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_profile_suspended boolean;
  v_has_org_link boolean;
  v_has_usable_org boolean;
begin
  v_user_id := (event->>'user_id')::uuid;

  select p.suspended_at is not null
    into v_profile_suspended
  from profiles p
  where p.id = v_user_id;

  select
    exists (
      select 1 from organization_members om where om.user_id = v_user_id
      union all
      select 1 from workers w where w.user_id = v_user_id
    ),
    exists (
      select 1 from organization_members om
      join organizations o on o.id = om.org_id
      where om.user_id = v_user_id and o.suspended_at is null
      union all
      select 1 from workers w
      join organizations o on o.id = w.org_id
      where w.user_id = v_user_id and o.suspended_at is null
    )
  into v_has_org_link, v_has_usable_org;

  if coalesce(v_profile_suspended, false) or (v_has_org_link and not v_has_usable_org) then
    raise exception 'DALA_ACCOUNT_SUSPENDED: this account or its organization has been suspended by an administrator';
  end if;

  return event;
end;
$function$;

-- =============================================================================
-- 0110_fix_invite_organization_member_null_bypass.sql
-- Ref: docs/audits/DALA_FULL_SYSTEM_AUDIT.md §Multi-Tenancy (MT-1)
--      docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- MEDIUM FIX — the LAST remaining instance of the NULL-bypass permission-check
-- shape that 0040 and 0093 fixed in 24 other functions. Found by the full system
-- audit (MT-1) while grepping every raw (non-coalesced) org_role_of(...) call
-- across the migration history and tracing each to its highest-numbered
-- definition.
--
-- ROOT CAUSE (identical to 0040/0093): `org_role_of()` returns NULL for a caller
-- with no organization_members row for that org at all — including a fully
-- unauthenticated caller, for whom auth.uid() is itself NULL. In PL/pgSQL
-- `NULL <> 'owner'` evaluates to NULL and `if NULL then ... end if;` is treated
-- as FALSE, so the `raise exception` was silently skipped and the check FAILED
-- OPEN — for exactly the caller it exists to reject:
--
--   if org_role_of(p_org_id) <> 'owner' then        -- dead check (before)
--     raise exception 'insufficient_permissions';
--   end if;
--
-- FIX: wrap the call in coalesce(..., 'none'), so a non-member resolves to the
-- literal string 'none', which IS `<> 'owner'` (a real TRUE, not NULL), and the
-- raise now actually fires. This is the single authorization pattern the repo
-- documents (docs/ARCHITECTURE.md "The one authorization pattern"); a bare
-- `org_role_of(x) <> '...'` is never correct.
--
-- WHY THIS IS LOW SEVERITY TODAY — and why 0093 did not already cover it: the
-- function is SECURITY INVOKER (0033's own comment says that is deliberate), so
-- the INSERT/UPDATE it performs still runs as the calling user and is still
-- subject to that table's RLS policies — organization_member_invitations_insert_
-- owner (`with check (org_role_of(org_id) = 'owner')`) and _update_owner. Unlike
-- a PL/pgSQL `IF`, an RLS USING/WITH CHECK clause treats a NULL result as "does
-- not pass", so a non-member's write is still rejected at the RLS layer today.
--
-- WHY IT STILL HAS TO BE FIXED: the function's own check is dead code doing
-- nothing, and 0040's own comment is explicit about this hazard for the sibling
-- functions it fixed — invite_worker/invite_org_to_project were patched because
-- "a future refactor that adds security definer here (as most sibling RPCs
-- already have) would silently inherit the live bug back". This function is the
-- one sibling RPC in that family that never got the coalesce treatment: one
-- SECURITY DEFINER edit away from a real privilege escalation (any authenticated
-- non-member inviting themselves into any org as manager/viewer), and
-- inconsistent with the repo-wide rule every other check follows.
--
-- The body below is reproduced in FULL (0033, unchanged apart from the one line)
-- because `create or replace function` requires the complete body. The signature
-- is unchanged, so Postgres preserves the existing COMMENT ON FUNCTION and the
-- `grant execute ... to authenticated` from 0033/0041 — no re-grant and no
-- re-comment is needed here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- invite_organization_member (0033) — NOT security definer; RLS on
-- organization_member_invitations already backstops this in practice, but the
-- check itself was dead. Fixed for consistency with 0040/0093's other 24
-- functions and to close the SECURITY DEFINER refactor hazard.
-- ---------------------------------------------------------------------------
create or replace function invite_organization_member(
  p_org_id uuid,
  p_email text,
  p_role text
)
returns uuid language plpgsql as $$
declare
  v_existing_id uuid;
  v_invitation_id uuid;
begin
  if coalesce(org_role_of(p_org_id), 'none') <> 'owner' then
    raise exception 'insufficient_permissions';
  end if;

  if p_role not in ('manager', 'viewer') then
    raise exception 'invalid_role';
  end if;

  -- Deliberately NOT pre-checking "is this email already a member" here:
  -- profiles has no email column (0002) — email lives only in auth.users,
  -- and find_user_id_by_email (0015) is intentionally service_role-only, so
  -- this SECURITY INVOKER function (running as the owner, not service_role)
  -- has no safe way to resolve an email to a user_id. Instead the
  -- already-a-member case is handled gracefully at accept time:
  -- accept_organization_member_invitation upserts into organization_members
  -- (`on conflict ... do update set role`), so accepting a redundant invite
  -- just re-confirms/updates the existing membership rather than erroring.

  select id into v_existing_id
  from organization_member_invitations
  where org_id = p_org_id and lower(invited_email) = lower(p_email)
  order by sent_at desc
  limit 1;

  if v_existing_id is not null then
    update organization_member_invitations
    set token = gen_random_uuid()::text,
        role = p_role,
        status = 'pending',
        sent_at = now(),
        expires_at = now() + interval '7 days',
        accepted_at = null
    where id = v_existing_id
    returning id into v_invitation_id;
  else
    insert into organization_member_invitations (org_id, invited_email, role, token, created_by)
    values (p_org_id, lower(p_email), p_role, gen_random_uuid()::text, auth.uid())
    returning id into v_invitation_id;
  end if;

  return v_invitation_id;
end;
$$;

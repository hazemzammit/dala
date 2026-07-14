-- =============================================================================
-- 0014_org_creation_and_reset_completion_rpc.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.3, §1.3.7, §1.3.13
--
-- Why this exists: organization_members' write policy requires the caller to
-- already be an 'owner' of the org (org_role_of(org_id) = 'owner') — correct
-- for every case EXCEPT the very first membership row on a brand-new org,
-- where nobody is an owner yet. A plain client-side INSERT is rejected by
-- design. security definer functions are the standard, narrow escape hatch:
-- they run with elevated privilege but do exactly one specific thing, with
-- auth.uid() still enforced inside the function body.
-- =============================================================================

-- Used by: (a) Doc 01 §1.3.13's "create an additional organization" flow,
-- called directly by an already-authenticated client; (b) the sign-up Edge
-- Function (Doc 01 §1.3.3), called with the service role right after
-- supabase.auth.admin.createUser() — see supabase/functions/sign-up.
--
-- security definer + explicit auth.uid() check (rather than trusting a
-- p_user_id parameter) is what keeps this from becoming a privilege-
-- escalation hole: a caller can only ever create an org owned by themselves.
create or replace function create_organization_for_current_user(
  p_name text,
  p_trade_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'create_organization_for_current_user requires an authenticated caller';
  end if;

  insert into organizations (name, trade_type, created_by)
  values (p_name, p_trade_type, v_user_id)
  returning id into v_org_id;

  insert into organization_members (org_id, user_id, role)
  values (v_org_id, v_user_id, 'owner');

  update profiles set active_org_id = v_org_id where id = v_user_id and active_org_id is null;

  return v_org_id;
end;
$$;

comment on function create_organization_for_current_user(text, text) is
  'Atomically creates an organization + the owner membership row for auth.uid(). The only sanctioned way to create the first membership on a new org — see file header for why a plain INSERT cannot do this under RLS.';

grant execute on function create_organization_for_current_user(text, text) to authenticated;

-- Doc 01 §1.3.7 step 5: on successful reset, mark the audit row completed.
-- Called by the client right after `supabase.auth.updateUser({ password })`
-- succeeds during the recovery session — auth.uid() at that point IS the
-- user who just reset their password, so scoping to auth.uid() is safe and
-- sufficient (no user_id parameter needed, and none accepted).
create or replace function mark_latest_password_reset_completed()
returns void
language sql
security definer
set search_path = public
as $$
  update password_reset_audit
  set completed_at = now()
  where user_id = auth.uid()
    and completed_at is null
  and requested_at = (
    select max(requested_at) from password_reset_audit
    where user_id = auth.uid() and completed_at is null
  );
$$;

comment on function mark_latest_password_reset_completed() is
  'Marks the most recent open password_reset_audit row for the CURRENT user as completed. Scoped to auth.uid() only — no user_id parameter, so a caller can never mark another account''s reset as completed.';

grant execute on function mark_latest_password_reset_completed() to authenticated;

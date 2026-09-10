-- =============================================================================
-- 0089_org_verification_request_queue.sql
-- Audit finding 3b, resolved as Option B (org self-serve request + admin
-- approval queue) — matches the `pending` value already sitting in
-- verification_status's own CHECK constraint (0075) and already present
-- in every display site's label map (VERIFICATION_LABEL has always had
-- 'pending', on both admin's OrgDetail.tsx and mobile's
-- organization-settings.tsx), which is a strong signal this was the
-- intended eventual design all along, not a new concept being invented
-- here. 0075's own comment on the column explicitly scoped the missing
-- piece as "an apps/admin surface, not a mobile-client-writable column"
-- for the actual verification decision — this migration builds exactly
-- that split: org self-serve request (client-writable, narrow), admin
-- decision (service-role only, via apps/admin's existing
-- api/admin/organizations/[orgId] mutation pattern, not a new RPC).
-- =============================================================================

alter table organizations add column verification_requested_at timestamptz;

comment on column organizations.verification_requested_at is
  'Set by request_org_verification() when an owner/manager asks for
   verification; distinguishes "never asked" (null, verification_status =
   unverified) from "asked, waiting on admin" (set, verification_status =
   pending). Cleared back to null on admin approval/rejection (see
   apps/admin''s organizations/[orgId] route, action = verify_org /
   reject_org_verification).';

create or replace function request_org_verification(p_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_status text;
begin
  -- org_role_of (0028) is the existing owner/manager role-check helper
  -- update_organization_profile already uses for exactly this kind of
  -- self-serve org mutation — reused here rather than re-deriving
  -- membership logic.
  v_role := org_role_of(p_org_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select verification_status into v_status from organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = 'P0002';
  end if;

  -- Only a genuinely unverified org can request verification — already
  -- pending (a second request wouldn't do anything) or already verified
  -- (nothing to request) are both no-ops, not errors, matching this
  -- schema's general "quiet no-op over a hard error for a state the UI
  -- shouldn't even let you reach" convention.
  if v_status <> 'unverified' then
    return;
  end if;

  update organizations
  set verification_status = 'pending',
      verification_requested_at = now()
  where id = p_org_id;
end;
$$;

comment on function request_org_verification(uuid) is
  'Audit fix 3b (Option B) — org-side half of the verification request
   queue. Owner/manager only (org_role_of, same gate
   update_organization_profile uses); moves verification_status from
   unverified to pending. The admin-side decision (approve -> verified,
   reject -> back to unverified) is a plain service-role update from
   apps/admin''s existing organizations/[orgId] mutation route, not a
   second RPC — that route already runs as service_role and already
   audit-logs every org mutation the same way.';

grant execute on function request_org_verification(uuid) to authenticated;

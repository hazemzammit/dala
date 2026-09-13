-- =============================================================================
-- 0091_fix_invite_org_to_project_missing_columns.sql
-- Ref: "new row violates row-level security policy for table
-- "project_invitations"" — collaboration.tsx, "Inviter une entreprise".
--
-- Root cause: 0024's original `invite_org_to_project` correctly inserted
-- both `lead_org_id` and `created_by`:
--
--   insert into project_invitations (
--     project_id, lead_org_id, invited_phone, invited_email, trade_type,
--     token, sent_via, created_by
--   )
--   values (
--     p_project_id, v_lead_org_id, p_invited_phone, p_invited_email,
--     p_trade_type, gen_random_uuid()::text, p_sent_via, auth.uid()
--   )
--
-- 0044 (free-tier downgrade enforcement) re-declared this function to add
-- the `is_org_past_due` check and switch to `expires_at`/`gen_random_bytes`
-- token generation, and in doing so silently dropped `lead_org_id` and
-- `created_by` from the INSERT's column list entirely:
--
--   insert into project_invitations (project_id, invited_phone,
--     invited_email, trade_type, sent_via, token, expires_at)
--   values (...)
--
-- `lead_org_id` is `not null` (0024) with no default, so every row this
-- INSERT tries to create is missing a required value — and this table's
-- own INSERT policy (0024) is gated entirely on that column:
--
--   create policy "project_invitations_insert_lead" on project_invitations
--     for insert with check (org_role_of(lead_org_id) in ('owner', 'manager'));
--
-- With `lead_org_id` absent, `org_role_of(lead_org_id)` has nothing valid
-- to evaluate, the check fails, and every invite attempt is rejected with
-- exactly the RLS error above — this was never actually a policy problem,
-- the policy was working correctly against a malformed row. 0050 later
-- re-declared this same function (to fix an unrelated pgcrypto
-- search_path issue) by copying 0044's body verbatim, carrying the same
-- gap forward without reintroducing it independently.
--
-- Fix: restore `lead_org_id` (already resolved into `v_lead_org_id` a few
-- lines earlier in this function, and validated via `org_role_of` right
-- after) and `created_by` (`auth.uid()`, matching 0024's original design
-- and every other invite/creation path in this schema) to the INSERT.
-- Everything else — the free-tier check, `expires_at`, token generation,
-- the resend-existing-invitation branch, the search_path fix — is
-- unchanged from 0050.
-- =============================================================================

create or replace function invite_org_to_project(
  p_project_id uuid,
  p_invited_phone text,
  p_invited_email text,
  p_trade_type text,
  p_sent_via text
)
returns uuid language plpgsql set search_path = public, extensions as $$
declare
  v_lead_org_id uuid;
  v_existing_id uuid;
  v_invitation_id uuid;
begin
  select lead_org_id into v_lead_org_id from projects where id = p_project_id;
  if v_lead_org_id is null then
    raise exception 'project_not_found';
  end if;

  if coalesce(org_role_of(v_lead_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if is_org_past_due(v_lead_org_id) then
    raise exception 'feature_requires_active_subscription'
      using detail = 'Multi-org collaboration is not available on the free tier.';
  end if;

  if p_invited_phone is null and p_invited_email is null then
    raise exception 'contact_required';
  end if;

  select id into v_existing_id
  from project_invitations
  where project_id = p_project_id
    and coalesce(invited_phone, '') = coalesce(p_invited_phone, '')
    and coalesce(invited_email, '') = coalesce(p_invited_email, '')
    and status = 'pending';

  if v_existing_id is not null then
    update project_invitations
    set token = encode(gen_random_bytes(24), 'hex'),
        expires_at = now() + interval '7 days',
        trade_type = p_trade_type,
        sent_via = p_sent_via
    where id = v_existing_id
    returning id into v_invitation_id;
  else
    insert into project_invitations (
      project_id, lead_org_id, invited_phone, invited_email, trade_type,
      sent_via, token, expires_at, created_by
    )
    values (
      p_project_id, v_lead_org_id, p_invited_phone, p_invited_email, p_trade_type,
      p_sent_via, encode(gen_random_bytes(24), 'hex'), now() + interval '7 days',
      auth.uid()
    )
    returning id into v_invitation_id;
  end if;

  return v_invitation_id;
end;
$$;

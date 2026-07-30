-- =============================================================================
-- 0030_phase9_rpc_grants_and_org_member_invitations.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5, §1.20 (new)
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.22
--
-- Two independent things happen in this file, one per part.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — RPC public-grants audit (Phase 8's flagged follow-up)
-- ---------------------------------------------------------------------------
-- Ran the audit for real this phase: walked every `SECURITY DEFINER` function
-- across migrations 0001-0029 and checked its actual grant state. Result: 23
-- of 24 already have an explicit grant/revoke at the point they're created —
-- either `authenticated`, a deliberate `anon` grant for a genuinely pre-login
-- RPC (health_check, app_version_check, get_worker_invitation_by_token,
-- get_project_invitation_by_token), or locked to `service_role` with
-- `public`/`anon`/`authenticated` explicitly revoked (find_user_id_by_email,
-- admin_get_totp_encryption_key, admin_storage_usage_by_org,
-- verify_and_consume_recovery_code). The plain SECURITY INVOKER
-- RLS-predicate/soft-delete functions (is_org_member, org_role_of,
-- is_project_member, is_own_worker, is_org_participant, soft_delete_project,
-- restore_project, soft_delete_organization, restore_organization,
-- soft_delete_worker, restore_worker, search_all) don't need one either —
-- they run under the CALLER's privileges, so the existing table grants
-- (0016) and RLS policies (0005 etc.) already gate them correctly; PUBLIC
-- EXECUTE on a SECURITY INVOKER function that touches RLS-protected,
-- anon-ungranted tables is a no-op for an anonymous caller, not a hole.
--
-- The one real gap: `is_shared_site_log_file(text)` (0025, Part 5). It's
-- SECURITY DEFINER — added specifically to let a `storage.objects` SELECT
-- policy check cross-org site-log-file visibility — but was never given an
-- explicit grant, so it sat at the Postgres default of PUBLIC EXECUTE. That
-- meant an unauthenticated (`anon`) caller could invoke it directly via RPC
-- and get a true/false on whether an arbitrary storage path string is
-- referenced by a `site_logs` row — a minor existence-oracle (it doesn't
-- expose the file itself, storage policies still gate that), but not
-- intentional, and not needed: the storage policy only ever needs
-- `authenticated` to be able to call it.
revoke execute on function is_shared_site_log_file(text) from public, anon;
grant execute on function is_shared_site_log_file(text) to authenticated;

comment on function is_shared_site_log_file(text) is
  'Doc 01 §1.5 storage-visibility helper (0025, Part 5). Explicitly restricted '
  'to authenticated as of 0030 — was left at the Postgres PUBLIC-EXECUTE '
  'default, letting anon probe arbitrary paths for existence. See 0030''s '
  'file header for the full grants audit this fix came out of.';

-- ---------------------------------------------------------------------------
-- Part 2 — organization_member_invitations (Doc 03 §3.22 invite-by-email cut)
-- ---------------------------------------------------------------------------
-- The scope explicitly cut from Phase 7 (see team-members.tsx's own header
-- comment and 0028's Part 2 note): role-change/removal for EXISTING
-- organization_members shipped in 0028, but there was no way to add a NEW
-- member by email. Structurally mirrors worker_invitations (0004) +
-- invite_worker (0018) one level up — org-to-user instead of org-to-worker —
-- with one deliberate difference from both existing invite systems here:
--
--   - Unlike worker_invitations (accept-worker-invitation ALWAYS creates a
--     brand-new account — a field worker never has a prior Dala account by
--     construction), an invited org member plausibly already has an account,
--     since this product's core decision is unlimited-orgs-per-account
--     (Doc 00 §0.5). So the accept flow needs the three-way branch
--     accept-org-invite.tsx already established for project_invitations
--     (already logged in / has account / no account) — see
--     accept-organization-invite.tsx.
--   - Unlike project_invitations' no-account path (which routes through the
--     sign-up Edge Function, because accepting there means CREATING a new
--     organization), an org-member invite's no-account path must NOT create
--     a new organization — the person is joining an EXISTING one. So it
--     mirrors accept-worker-invitation's shape instead (a dedicated Edge
--     Function, service role, invite-channel-is-identity-proof, no separate
--     email-verification gate) rather than sign-up's.
--
-- role is constrained to ('manager', 'viewer') here, not 'owner' — inviting
-- someone directly in as owner would hand over full org control (including
-- billing/deletion) through an email link with no additional confirmation;
-- ownership transfer isn't something this pipeline does. An owner can always
-- promote an already-accepted member to owner afterward via
-- update_organization_member_role (0028), which already blocks the
-- zero-owner case.

create table organization_member_invitations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  invited_email  text not null,
  role           text not null check (role in ('manager', 'viewer')),
  token          text not null unique,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_by     uuid not null references profiles(id),
  sent_at        timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '7 days',
  accepted_at    timestamptz
);

create index organization_member_invitations_org_id_idx on organization_member_invitations (org_id);

comment on table organization_member_invitations is
  'Doc 03 §3.22 — invite-by-email pipeline for organization_members, cut from '
  'Phase 7 and built in 0030. Mirrors worker_invitations (0004) one level up.';

alter table organization_member_invitations enable row level security;

-- Any current member can see the org's pending/past invitations (same
-- transparency worker_invitations gives — 0005's
-- worker_invitations_select_member policy). Only the owner can create/edit
-- one, matching organization_members_write_owner (0005) and
-- update_organization_member_role/remove_organization_member (0028)'s
-- owner-only gate for anything that changes who's in the org.
create policy "organization_member_invitations_select_member" on organization_member_invitations
  for select using (is_org_member(org_id));

create policy "organization_member_invitations_insert_owner" on organization_member_invitations
  for insert with check (org_role_of(org_id) = 'owner');

create policy "organization_member_invitations_update_owner" on organization_member_invitations
  for update using (org_role_of(org_id) = 'owner');

-- ---------------------------------------------------------------------------
-- invite_organization_member — owner sends/re-sends an invite.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default, not stated explicitly — same as
-- invite_worker/invite_org_to_project): this does the upsert convenience,
-- not a permission bypass, so it must run as the calling user and stay
-- subject to the RLS policies just created.
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
  if org_role_of(p_org_id) <> 'owner' then
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

grant execute on function invite_organization_member(uuid, text, text) to authenticated;

comment on function invite_organization_member(uuid, text, text) is
  'Doc 03 §3.22 — owner invites/re-invites a member by email. Generates the '
  'token server-side (gen_random_uuid), same reasoning as invite_worker '
  '(0018): a client-generated token is a bearer credential. Upserts by '
  '(org_id, lower(email)) so a re-invite updates the existing row.';

-- ---------------------------------------------------------------------------
-- get_organization_member_invitation_by_token — anon-safe token lookup.
-- ---------------------------------------------------------------------------
-- Mirrors get_worker_invitation_by_token (0017) / get_project_invitation_by_
-- token (0024): runs before the invited person necessarily has a session.
create or replace function get_organization_member_invitation_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'organization_name', o.name,
    'invited_email', omi.invited_email,
    'role', omi.role,
    'status', omi.status,
    'expired', omi.expires_at < now()
  )
  from organization_member_invitations omi
  join organizations o on o.id = omi.org_id
  where omi.token = p_token;
$$;

grant execute on function get_organization_member_invitation_by_token(text) to anon;

comment on function get_organization_member_invitation_by_token(text) is
  'Anon-safe, token-scoped lookup for the accept-organization-invite screen. '
  'Mirrors get_worker_invitation_by_token (0017) / get_project_invitation_by_token (0024).';

-- ---------------------------------------------------------------------------
-- accept_organization_member_invitation — existing-account path.
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required (unlike invite_organization_member): before
-- this call the accepting user has no organization_members row for this
-- org, so no ordinary RLS policy would let them write it — same shape of
-- problem accept_project_invitation (0024) and
-- create_organization_for_current_user (0014) solve. auth.uid()/auth.email()
-- are read explicitly inside the function body, never trusted from a
-- parameter. The email match check is real access control, not a courtesy:
-- without it, anyone who is merely logged in (any account, any org) could
-- accept ANY invitation token they got hold of and join a stranger's org.
create or replace function accept_organization_member_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  -- auth.jwt() ->> 'email', not the auth.email() helper: matches this
  -- repo's existing precedent (0029's `auth.jwt() ->> 'aal'`) rather than
  -- introducing a second way of reading JWT claims that's never been used
  -- here before.
  v_user_email text := lower(auth.jwt() ->> 'email');
  v_invitation organization_member_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select * into v_invitation from organization_member_invitations where token = p_token;
  if v_invitation.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_invitation.status = 'accepted' then
    raise exception 'already_accepted';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'expired';
  end if;
  if lower(v_invitation.invited_email) <> v_user_email then
    raise exception 'email_mismatch';
  end if;

  insert into organization_members (org_id, user_id, role)
  values (v_invitation.org_id, v_user_id, v_invitation.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update organization_member_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invitation.id;

  return v_invitation.org_id;
end;
$$;

grant execute on function accept_organization_member_invitation(text) to authenticated;

comment on function accept_organization_member_invitation(text) is
  'Doc 03 §3.22 — existing-account path of the org-member invite accept flow. '
  'Activates organization_members(role) for the CURRENT session''s user, '
  'after verifying the session''s email matches the invited address (real '
  'access control, not a courtesy — see this function''s own comment above). '
  'The no-account path is handled by the new accept-organization-invitation '
  'Edge Function instead, mirroring accept-worker-invitation (0018-adjacent) '
  'rather than sign-up, since this must NOT create a new organization.';

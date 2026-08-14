-- =============================================================================
-- 0040_fix_org_role_check_null_bypass.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- CRITICAL FIX — found while investigating the live RPC-grants query
-- (Phase 16), one level deeper than the grants gap itself. Nine functions
-- across five migrations (0018, 0019, 0020, 0024) all share this exact
-- permission-check shape:
--
--   if org_role_of(p_org_id) not in ('owner', 'manager') then
--     raise exception 'insufficient_permissions';
--   end if;
--
-- `org_role_of()` returns NULL when the caller has no organization_members
-- row for that org at all (not just "not owner/manager" — genuinely not a
-- member, including a fully unauthenticated caller, for whom auth.uid()
-- itself is NULL). In PL/pgSQL, `NULL not in (...)` evaluates to NULL, and
-- `if NULL then ... end if;` is treated as FALSE, not TRUE — so the `raise
-- exception` is silently skipped and the function proceeds as though the
-- check passed. This fails OPEN, not closed: the one case this check most
-- needs to catch — a caller with no relationship to the org at all — is
-- exactly the case it fails to catch.
--
-- SEVERITY VARIES BY FUNCTION, and both are treated as in-scope here:
--
--   SECURITY DEFINER (bug is the ONLY line of defense — the underlying
--   table write bypasses RLS entirely, so this check silently failing
--   open means there is no defense left at all):
--     create_advance, approve_advance, mark_salary_cycle_paid,
--     generate_client_portal_link, set_client_portal_pin,
--     disable_client_portal_pin, accept_project_invitation.
--
--   NOT security definer (the underlying INSERT/UPDATE is still subject
--   to the target table's own RLS policy as a backstop — e.g.
--   `workers_write_owner_manager`/`project_invitations`' own policies
--   still gate the actual write — so these are lower practical severity,
--   but the check is still dead code doing nothing today, which is its
--   own kind of bug, and both get the identical one-line fix for
--   consistency and because relying on an incidental RLS backstop rather
--   than the function's own stated check is fragile, not a design):
--     invite_worker, invite_org_to_project.
--
-- Not filed as two separate migrations because it's the same fix, same
-- root cause, same discovery session — splitting it would just make the
-- history harder to follow for no safety benefit.
--
-- FIX: wrap every such check in `coalesce(org_role_of(...), 'none')` so a
-- non-member caller evaluates to the literal string `'none'`, which IS
-- `not in ('owner', 'manager')` (a real TRUE, not NULL) — the exception
-- now actually raises for exactly the caller this check was always meant
-- to catch. No other logic in any of these nine functions changes; every
-- function below is reproduced in full only because `create or replace
-- function` requires the complete body, not a patch.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- invite_worker (0018) — NOT security definer; RLS on `workers` already
-- backstops this in practice, but the check itself was dead. Fixed for
-- consistency and because a future refactor that adds security definer
-- here (as most sibling RPCs already have) would silently inherit the
-- live bug back if this weren't fixed now.
-- ---------------------------------------------------------------------------
create or replace function invite_worker(
  p_org_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_trade text,
  p_daily_rate numeric,
  p_channel text
)
returns uuid language plpgsql as $$
declare
  v_worker_id uuid;
  v_existing_invite_id uuid;
begin
  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  select id into v_worker_id
  from workers
  where org_id = p_org_id and lower(email) = lower(p_email)
  limit 1;

  if v_worker_id is null then
    insert into workers (org_id, full_name, email, phone, trade, daily_rate)
    values (p_org_id, p_full_name, p_email, p_phone, p_trade, p_daily_rate)
    returning id into v_worker_id;
  end if;

  select id into v_existing_invite_id
  from worker_invitations
  where worker_id = v_worker_id
  order by sent_at desc
  limit 1;

  if v_existing_invite_id is not null then
    update worker_invitations
    set token = gen_random_uuid()::text,
        channel = p_channel,
        status = 'pending',
        sent_at = now(),
        expires_at = now() + interval '7 days',
        accepted_at = null
    where id = v_existing_invite_id;
  else
    insert into worker_invitations (worker_id, token, channel, status, expires_at)
    values (v_worker_id, gen_random_uuid()::text, p_channel, 'pending', now() + interval '7 days');
  end if;

  return v_worker_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_advance (0019) — SECURITY DEFINER. Was the only line of defense
-- against a caller with no membership on p_org_id creating an
-- already-approved advance for that org's own money.
-- ---------------------------------------------------------------------------
create or replace function create_advance(
  p_org_id uuid,
  p_worker_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_hash text;
  v_existing idempotency_keys;
  v_advance advances;
begin
  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_request_hash := md5(
    coalesce(p_org_id::text, '') || '|' ||
    coalesce(p_worker_id::text, '') || '|' ||
    coalesce(p_amount::text, '') || '|' ||
    coalesce(p_reason, '')
  );

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_advance from advances where id = (v_existing.response_body ->> 'id')::uuid;
    return v_advance;
  end if;

  insert into advances (org_id, worker_id, amount, reason, status, approved_by, idempotency_key)
  values (p_org_id, p_worker_id, p_amount, p_reason, 'approved', auth.uid(), p_idempotency_key)
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, p_org_id, 'create_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

-- ---------------------------------------------------------------------------
-- approve_advance (0019) — SECURITY DEFINER. Was the only line of defense
-- against approving any org's pending advance.
-- ---------------------------------------------------------------------------
create or replace function approve_advance(
  p_advance_id uuid,
  p_idempotency_key uuid
)
returns advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target advances;
  v_request_hash text;
  v_existing idempotency_keys;
  v_advance advances;
begin
  select * into v_target from advances where id = p_advance_id;
  if not found then
    raise exception 'advance_not_found';
  end if;

  if coalesce(org_role_of(v_target.org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if v_target.status <> 'pending' then
    raise exception 'advance_not_pending';
  end if;

  v_request_hash := md5(coalesce(p_advance_id::text, ''));

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_advance from advances where id = p_advance_id;
    return v_advance;
  end if;

  update advances
  set status = 'approved', approved_by = auth.uid()
  where id = p_advance_id
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_target.org_id, 'approve_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_salary_cycle_paid (0019) — SECURITY DEFINER. Was the only line of
-- defense against marking any org's salary cycle as paid.
-- ---------------------------------------------------------------------------
create or replace function mark_salary_cycle_paid(
  p_salary_cycle_id uuid,
  p_idempotency_key uuid
)
returns salary_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target salary_cycles;
  v_request_hash text;
  v_existing idempotency_keys;
  v_cycle salary_cycles;
begin
  select * into v_target from salary_cycles where id = p_salary_cycle_id;
  if not found then
    raise exception 'salary_cycle_not_found';
  end if;

  if coalesce(org_role_of(v_target.org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  v_request_hash := md5(coalesce(p_salary_cycle_id::text, ''));

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_cycle from salary_cycles where id = p_salary_cycle_id;
    return v_cycle;
  end if;

  update salary_cycles
  set status = 'paid', paid_at = now(), idempotency_key = p_idempotency_key
  where id = p_salary_cycle_id
  returning * into v_cycle;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_target.org_id, 'mark_salary_cycle_paid', v_request_hash, 200, jsonb_build_object('id', v_cycle.id));

  return v_cycle;
end;
$$;

-- ---------------------------------------------------------------------------
-- generate_client_portal_link (0020) — SECURITY DEFINER. Was the only line
-- of defense against rotating (and thereby learning) any project's client
-- portal link — the exact bug that started this investigation.
-- ---------------------------------------------------------------------------
create or replace function generate_client_portal_link(p_project_id uuid)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  insert into client_portals (org_id, project_id, link_token)
  values (v_org_id, p_project_id, encode(gen_random_bytes(16), 'hex'))
  on conflict (project_id) do update
    set link_token = encode(gen_random_bytes(16), 'hex'),
        updated_at = now()
  returning * into v_portal;

  return v_portal;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_client_portal_pin (0020) — SECURITY DEFINER. Was the only line of
-- defense against setting (or resetting) any project's client-portal PIN.
-- ---------------------------------------------------------------------------
create or replace function set_client_portal_pin(p_project_id uuid, p_pin text)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format';
  end if;

  insert into client_portals (org_id, project_id, link_token, pin_enabled, pin_hash, failed_pin_attempts, locked_until, last_reset_at, last_reset_by)
  values (v_org_id, p_project_id, encode(gen_random_bytes(16), 'hex'), true, crypt(p_pin, gen_salt('bf')), 0, null, now(), auth.uid())
  on conflict (project_id) do update
    set pin_enabled = true,
        pin_hash = crypt(p_pin, gen_salt('bf')),
        failed_pin_attempts = 0,
        locked_until = null,
        last_reset_at = now(),
        last_reset_by = auth.uid(),
        updated_at = now()
  returning * into v_portal;

  return v_portal;
end;
$$;

-- ---------------------------------------------------------------------------
-- disable_client_portal_pin (0020) — SECURITY DEFINER. Was the only line
-- of defense against disabling any project's client-portal PIN.
-- ---------------------------------------------------------------------------
create or replace function disable_client_portal_pin(p_project_id uuid)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select org_id into v_org_id from client_portals where project_id = p_project_id;
  if v_org_id is null then
    raise exception 'portal_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  update client_portals
  set pin_enabled = false, pin_hash = null, failed_pin_attempts = 0, locked_until = null, updated_at = now()
  where project_id = p_project_id
  returning * into v_portal;

  return v_portal;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_org_to_project (0024) — NOT security definer; RLS on
-- `project_invitations` (write policy gated by `org_role_of` on the lead
-- org) backstops this write in practice, but the check itself was dead.
-- Fixed for the same consistency reasoning as invite_worker above.
-- ---------------------------------------------------------------------------
create or replace function invite_org_to_project(
  p_project_id uuid,
  p_invited_phone text,
  p_invited_email text,
  p_trade_type text,
  p_sent_via text
)
returns uuid language plpgsql as $$
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

  if p_invited_phone is null and p_invited_email is null then
    raise exception 'contact_required';
  end if;

  select id into v_existing_id
  from project_invitations
  where project_id = p_project_id
    and status = 'pending'
    and (
      (p_invited_phone is not null and invited_phone = p_invited_phone)
      or (p_invited_email is not null and lower(invited_email) = lower(p_invited_email))
    )
  order by sent_at desc
  limit 1;

  if v_existing_id is not null then
    update project_invitations
    set token = gen_random_uuid()::text,
        trade_type = p_trade_type,
        sent_via = p_sent_via,
        sent_at = now(),
        expires_at = now() + interval '7 days'
    where id = v_existing_id
    returning id into v_invitation_id;
  else
    insert into project_invitations (
      project_id, lead_org_id, invited_phone, invited_email, trade_type,
      token, sent_via, created_by
    )
    values (
      p_project_id, v_lead_org_id, p_invited_phone, p_invited_email, p_trade_type,
      gen_random_uuid()::text, p_sent_via, auth.uid()
    )
    returning id into v_invitation_id;
  end if;

  return v_invitation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_project_invitation (0024) — SECURITY DEFINER, and already gates
-- on `auth.uid() is null` first, so the practical exploit window here is
-- narrower than the other six SECURITY DEFINER functions above (requires
-- a real authenticated session whose own `profiles.active_org_id` points
-- at an org they no longer actually belong to — a stale-state edge case,
-- not a fully-anonymous one). Still the same dead-check shape, same fix.
-- ---------------------------------------------------------------------------
create or replace function accept_project_invitation(
  p_token text,
  p_budget_rollup_opt_in boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_invitation project_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select * into v_invitation from project_invitations where token = p_token;
  if v_invitation.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_invitation.status = 'accepted' then
    raise exception 'already_accepted';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'expired';
  end if;

  select active_org_id into v_org_id from profiles where id = v_user_id;
  if v_org_id is null then
    raise exception 'no_active_organization';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  insert into project_memberships (project_id, org_id, role, budget_rollup_opt_in)
  values (v_invitation.project_id, v_org_id, 'trade', p_budget_rollup_opt_in)
  on conflict (project_id, org_id)
  do update set budget_rollup_opt_in = excluded.budget_rollup_opt_in;

  update project_invitations
  set status = 'accepted', accepted_at = now(), invited_org_id = v_org_id
  where id = v_invitation.id;

  return v_invitation.project_id;
end;
$$;

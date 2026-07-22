-- =============================================================================
-- 0018_invite_worker_rpc.sql
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.13.2
--
-- The invite-worker screen was going to generate the `worker_invitations`
-- token client-side (Math.random-based) and INSERT/UPDATE it directly. That
-- token is a bearer credential — anyone holding it can create the worker's
-- account via accept-worker-invitation, so a client-generated,
-- non-cryptographic token is a real account-takeover risk, not a
-- style nitpick. Moving generation server-side, using the same
-- gen_random_uuid() already relied on for every primary key in this schema,
-- closes that gap outright rather than trying to "generate it more
-- carefully" in TypeScript.
--
-- SECURITY INVOKER (the default — not stated explicitly below since that IS
-- the default) is deliberate here, unlike get_worker_invitation_by_token's
-- SECURITY DEFINER in 0017: this function still needs the caller to satisfy
-- "org_role_of(org_id) in ('owner','manager')" — it does the upsert
-- convenience, not a permission bypass, so it must run as the calling user
-- and be subject to the existing workers/worker_invitations RLS policies.
-- =============================================================================

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
  if org_role_of(p_org_id) not in ('owner', 'manager') then
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

grant execute on function invite_worker(uuid, text, text, text, text, numeric, text) to authenticated;

comment on function invite_worker(uuid, text, text, text, text, numeric, text) is
  'Doc 03 §3.13.2 — invite/re-invite a worker in one call. Generates the '
  'worker_invitations token server-side (gen_random_uuid) instead of trusting '
  'a client-supplied value; upserts by (org_id, lower(email)) so a re-invite '
  'updates the existing worker_invitations row rather than creating a duplicate.';

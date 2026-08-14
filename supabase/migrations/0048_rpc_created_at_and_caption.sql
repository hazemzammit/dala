-- =============================================================================
-- 0048_rpc_created_at_and_caption.sql
-- Ref: Phase 21 (mobile sync-engine closure). Closes the two disclosed
-- pushChanges.ts limitations carried forward, unfixed, since Phase 19:
--
--   1. `created_at` is preserved for attendance_records/materials (plain
--      table upserts), but NOT for advances/site_logs — neither
--      create_advance/request_advance/submit_site_log_entry accepted a
--      timestamp-override parameter, so a genuinely offline-created advance
--      or site log always showed its server-arrival time, not the true
--      field moment.
--   2. `submit_site_log_entry` has no `caption` parameter at all — the
--      column has existed on `site_logs` since migration 0008, and
--      pushChanges.ts's own header already names this as a real gap, but no
--      write path (this RPC included) can ever set it.
--
-- Same backward-compatible pattern as `p_id` in migration 0047: each new
-- parameter is appended as an optional, default-null LAST argument on a
-- fresh `create or replace function` overload, so every existing caller
-- (this repo's own screens, the idempotency test suite, migration 0047's
-- own 6/4/9-arg overloads) keeps resolving to whichever signature it
-- already calls, unchanged. `p_created_at` falls back to `now()` exactly
-- like the column's own pre-existing default when omitted — no behavior
-- change for any caller that doesn't pass it.
--
-- `p_created_at` is deliberately NOT folded into `v_request_hash` for any
-- of the three functions — the hash exists to detect "same logical request,
-- replayed" (Doc 01 §1.11.2), and the true offline-creation moment isn't
-- part of what makes two requests the same or different; two pushes of the
-- SAME local row (e.g. a retried sync after a dropped connection) must
-- still collide on the same idempotency key and hash regardless of any
-- clock drift between attempts.
--
-- DISCLOSED BUG FOUND BEYOND THIS PHASE'S STATED SCOPE, fixed here since it
-- touches the exact three functions already being edited: migration 0047's
-- own 6/4/9-arg overloads (the ones that added `p_id`) were never paired
-- with a `revoke ... from public` before their `grant ... to authenticated`
-- — unlike every other RPC grant in this repo (migration 0041's entire
-- purpose), and unlike the ORIGINAL 5/3/8-arg signatures of these same
-- three functions, which 0041 correctly revoked-from-public before 0047
-- ever ran. Confirmed (not assumed) by grepping 0047's own file for
-- `revoke` — zero matches. Postgres grants `EXECUTE` to `PUBLIC` by default
-- on function creation (this repo's own `alter default privileges` in
-- migration 0016 deliberately does NOT cover functions — see that file's
-- header, "every function's access is granted explicitly, at the point
-- it's created"), so 0047's 6/4/9-arg overloads have been callable by
-- `anon`/`public` since Phase 19, reintroducing exactly the gap 0041 fixed
-- for the original signatures — for the p_id-bearing overloads only. In
-- practice this is not a data-exposure hole (every one of these 3
-- functions independently checks `org_role_of()` or
-- `workers.user_id = auth.uid()` and raises when that resolves to nothing,
-- which it always does for an anon caller with no session) — but it's a
-- real deviation from this repo's own stated grant convention, closed here
-- rather than left for a future migration to rediscover.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix the disclosed 0047 grant gap first, for the overloads that already
-- exist (6/4/9-arg, `p_id`-bearing) — before adding the new 7/5/11-arg
-- overloads below, which get the correct revoke+grant pair from the start.
-- ---------------------------------------------------------------------------
revoke execute on function create_advance(uuid, uuid, numeric, text, uuid, uuid) from public;
revoke execute on function request_advance(numeric, text, uuid, uuid) from public;
revoke execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- create_advance: 6-arg (0047) -> 7-arg, + p_created_at
-- ---------------------------------------------------------------------------
create or replace function create_advance(
  p_org_id uuid,
  p_worker_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_id uuid default null,
  p_created_at timestamptz default null
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
  if org_role_of(p_org_id) not in ('owner', 'manager') then
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

  insert into advances (id, org_id, worker_id, amount, reason, status, approved_by, idempotency_key, created_at)
  values (
    coalesce(p_id, gen_random_uuid()), p_org_id, p_worker_id, p_amount, p_reason, 'approved', auth.uid(),
    p_idempotency_key, coalesce(p_created_at, now())
  )
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, p_org_id, 'create_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

revoke execute on function create_advance(uuid, uuid, numeric, text, uuid, uuid, timestamptz) from public;
grant execute on function create_advance(uuid, uuid, numeric, text, uuid, uuid, timestamptz) to authenticated;

comment on function create_advance(uuid, uuid, numeric, text, uuid, uuid, timestamptz) is
  'Doc 03 §3.14 — contractor quick-advance. Owner/manager only. Idempotency-checked against idempotency_keys (Doc 01 §1.11). p_id (migration 0047): optional client-supplied row id for the WatermelonDB offline-first push path. p_created_at (migration 0048): optional client-supplied creation timestamp, preserving the true offline-creation moment for the same push path — falls back to now() when omitted, same as every pre-0048 caller.';

-- ---------------------------------------------------------------------------
-- request_advance: 4-arg (0047) -> 5-arg, + p_created_at
-- ---------------------------------------------------------------------------
create or replace function request_advance(
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_id uuid default null,
  p_created_at timestamptz default null
)
returns advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker workers;
  v_request_hash text;
  v_existing idempotency_keys;
  v_advance advances;
begin
  select * into v_worker from workers where user_id = auth.uid();
  if not found then
    raise exception 'no_worker_record_for_current_user';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_request_hash := md5(
    coalesce(v_worker.id::text, '') || '|' ||
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

  insert into advances (id, org_id, worker_id, amount, reason, status, requested_by, idempotency_key, created_at)
  values (
    coalesce(p_id, gen_random_uuid()), v_worker.org_id, v_worker.id, p_amount, p_reason, 'pending', auth.uid(),
    p_idempotency_key, coalesce(p_created_at, now())
  )
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'request_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

revoke execute on function request_advance(numeric, text, uuid, uuid, timestamptz) from public;
grant execute on function request_advance(numeric, text, uuid, uuid, timestamptz) to authenticated;

comment on function request_advance(numeric, text, uuid, uuid, timestamptz) is
  'Doc 03 §4.4 — worker advance request. Always inserts status=pending; worker resolved server-side from auth.uid(), never trusted as a parameter. p_id (migration 0047) / p_created_at (migration 0048): same WatermelonDB offline-first push-path rationale as create_advance.';

-- ---------------------------------------------------------------------------
-- submit_site_log_entry: 9-arg (0047) -> 11-arg, + p_created_at, p_caption
-- ---------------------------------------------------------------------------
create or replace function submit_site_log_entry(
  p_project_id uuid,
  p_photo_url text,
  p_voice_note_url text,
  p_note_text text,
  p_thumbnail_url text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_idempotency_key uuid,
  p_id uuid default null,
  p_created_at timestamptz default null,
  p_caption text default null
)
returns site_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker workers;
  v_request_hash text;
  v_existing idempotency_keys;
  v_log site_logs;
begin
  select * into v_worker from workers where user_id = auth.uid();
  if not found then
    raise exception 'no_worker_record_for_current_user';
  end if;

  if p_photo_url is null and p_voice_note_url is null and (p_note_text is null or length(trim(p_note_text)) = 0) then
    raise exception 'at_least_one_field_required';
  end if;

  if not exists (select 1 from projects where id = p_project_id and lead_org_id = v_worker.org_id) then
    raise exception 'project_not_in_worker_org';
  end if;

  v_request_hash := md5(
    coalesce(v_worker.id::text, '') || '|' ||
    coalesce(p_project_id::text, '') || '|' ||
    coalesce(p_photo_url, '') || '|' ||
    coalesce(p_voice_note_url, '') || '|' ||
    coalesce(p_note_text, '')
  );

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_log from site_logs where id = (v_existing.response_body ->> 'id')::uuid;
    return v_log;
  end if;

  insert into site_logs (
    id, org_id, project_id, photo_url, voice_note_url, note_text, thumbnail_url,
    location_lat, location_lng, logged_by, idempotency_key, caption, created_at
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_worker.org_id, p_project_id, p_photo_url, p_voice_note_url, p_note_text, p_thumbnail_url,
    p_location_lat, p_location_lng, auth.uid(), p_idempotency_key, p_caption, coalesce(p_created_at, now())
  )
  returning * into v_log;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'submit_site_log_entry', v_request_hash, 200, jsonb_build_object('id', v_log.id));

  return v_log;
end;
$$;

revoke execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) from public;
grant execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) to authenticated;

comment on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) is
  'Doc 03 §4.2 — worker site log submission. p_id (migration 0047): optional client-supplied row id for the WatermelonDB offline-first push path. p_created_at / p_caption (migration 0048): optional client-supplied creation timestamp and photo caption, closing the two gaps disclosed since Phase 19 — falls back to now()/null when omitted, same as every pre-0048 caller.';

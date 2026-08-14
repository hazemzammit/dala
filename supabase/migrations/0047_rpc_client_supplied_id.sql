-- =============================================================================
-- 0047_rpc_client_supplied_id.sql
-- Ref: Phase 19 (mobile offline-sync screen wiring) discovery.
--
-- `create_advance`, `request_advance` (migration 0019), and
-- `submit_site_log_entry` (migration 0020) all insert with `id` left to its
-- column default (`gen_random_uuid()`) and return the server-generated row.
-- That's a real problem for offline-first: every WatermelonDB model in
-- `apps/mobile/src/db/models/` documents "id is the same UUID as the
-- Postgres row's id, generated client-side... Postgres accepts a
-- client-supplied uuid on insert" as the whole reason there's no separate
-- server_id column (see e.g. DispatchAssignment.ts's header) — but these
-- 3 RPCs never gave the client that option, so a locally-created
-- `advances`/`site_logs` row pushed through one of them would come back
-- with a DIFFERENT id than the local record already has, breaking the
-- local-id-equals-server-id invariant the whole sync design depends on.
--
-- Not discovered until Phase 19's screen-wiring work actually needed to
-- call these RPCs from the sync engine's push path and had to ask "what id
-- does the local WatermelonDB record end up with" — flagged and fixed here
-- rather than worked around client-side (e.g. rewriting the local record's
-- id after the fact, which WatermelonDB doesn't cleanly support anyway).
--
-- Backward-compatible signature change: `p_id uuid default null` appended
-- as the LAST parameter on all three, defaulting to `gen_random_uuid()`
-- when omitted — every existing caller (advances.tsx, advance-request.tsx,
-- update-chantier.tsx, the idempotency test suite) keeps working
-- unchanged; only Phase 19's new WatermelonDB push path passes it.
-- =============================================================================

create or replace function create_advance(
  p_org_id uuid,
  p_worker_id uuid,
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_id uuid default null
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

  insert into advances (id, org_id, worker_id, amount, reason, status, approved_by, idempotency_key)
  values (coalesce(p_id, gen_random_uuid()), p_org_id, p_worker_id, p_amount, p_reason, 'approved', auth.uid(), p_idempotency_key)
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, p_org_id, 'create_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

grant execute on function create_advance(uuid, uuid, numeric, text, uuid, uuid) to authenticated;

comment on function create_advance(uuid, uuid, numeric, text, uuid, uuid) is
  'Doc 03 §3.14 — contractor quick-advance. Owner/manager only. Idempotency-checked against idempotency_keys (Doc 01 §1.11). p_id (migration 0047): optional client-supplied row id, for the WatermelonDB offline-first push path — falls back to gen_random_uuid() when omitted so every pre-0047 caller is unaffected.';

create or replace function request_advance(
  p_amount numeric,
  p_reason text,
  p_idempotency_key uuid,
  p_id uuid default null
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

  insert into advances (id, org_id, worker_id, amount, reason, status, requested_by, idempotency_key)
  values (coalesce(p_id, gen_random_uuid()), v_worker.org_id, v_worker.id, p_amount, p_reason, 'pending', auth.uid(), p_idempotency_key)
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'request_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

grant execute on function request_advance(numeric, text, uuid, uuid) to authenticated;

comment on function request_advance(numeric, text, uuid, uuid) is
  'Doc 03 §4.4 — worker advance request. Always inserts status=pending; worker resolved server-side from auth.uid(), never trusted as a parameter. p_id (migration 0047): optional client-supplied row id for the WatermelonDB offline-first push path, same as create_advance.';

create or replace function submit_site_log_entry(
  p_project_id uuid,
  p_photo_url text,
  p_voice_note_url text,
  p_note_text text,
  p_thumbnail_url text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_idempotency_key uuid,
  p_id uuid default null
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
    location_lat, location_lng, logged_by, idempotency_key
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_worker.org_id, p_project_id, p_photo_url, p_voice_note_url, p_note_text, p_thumbnail_url,
    p_location_lat, p_location_lng, auth.uid(), p_idempotency_key
  )
  returning * into v_log;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'submit_site_log_entry', v_request_hash, 200, jsonb_build_object('id', v_log.id));

  return v_log;
end;
$$;

grant execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid) to authenticated;

comment on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid) is
  'Doc 03 §4.2 — worker site log submission. p_id (migration 0047): optional client-supplied row id for the WatermelonDB offline-first push path, same rationale as create_advance/request_advance.';

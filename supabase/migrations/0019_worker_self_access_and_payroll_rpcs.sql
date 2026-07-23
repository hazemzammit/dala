-- =============================================================================
-- 0019_worker_self_access_and_payroll_rpcs.sql
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.14, §4.4, §4.5
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5, §1.11
--
-- *** Fixes a real, pre-existing bug, not just new Phase 2 scope. ***
--
-- A worker account is a `profiles` row linked via `workers.user_id` — it is
-- NOT a row in `organization_members`. Every policy on
-- attendance_records/advances/salary_cycles/dispatch_assignments up to this
-- point is written as `is_org_member(org_id)` / `org_role_of(org_id) in
-- ('owner','manager')`, which a worker never satisfies. That means the
-- worker check-in flow already shipped in Phase 1
-- (apps/mobile/src/app/(worker)/home.tsx — it reads dispatch_assignments,
-- updates dispatch_assignments.actual_departure_time, inserts
-- attendance_records, and reads attendance_records + advances for the
-- salary strip) has been running against RLS policies that would reject
-- every one of those calls for an actual worker session. It likely reads
-- as "working" in local testing only if it's been tested from an
-- owner/manager session rather than a real worker login. This migration
-- adds the missing self-access policies; it does not change any policy
-- an owner/manager already relies on.
--
-- Second half of this file: the money-moving RPCs Doc 01 §1.11 requires.
-- `idempotency_keys` (0010) is a service-role-only table — no client
-- policies exist on it at all — so a plain client-side INSERT carrying an
-- `idempotency_key` column value (which is all createAdvanceSchema /
-- markSalaryCyclePaidSchema actually enforce today) never touches that
-- table and doesn't implement the request-hash / cached-replay flow §1.11.2
-- describes. These RPCs are `security definer`, mirroring the
-- `invite_worker` (0018) / `create_organization_for_current_user` (0014)
-- pattern already established in this codebase for exactly this shape of
-- problem: elevated privilege for one narrow, auth.uid()-checked action.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — worker-self RLS
-- ---------------------------------------------------------------------------

create or replace function is_own_worker(target_worker uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from workers
    where id = target_worker and user_id = auth.uid()
  );
$$;

comment on function is_own_worker(uuid) is
  'RLS predicate: is the current user the worker (not org member) this row belongs to? Table-lookup on workers.user_id, same pattern as is_org_member/org_role_of — never JWT claims.';

-- dispatch_assignments: a worker needs to see today's mission and flip
-- actual_departure_time via the two-tap "Je suis parti"/"Je suis arrivé"
-- state machine (Doc 03 §4.1). Column-level restriction (a worker should
-- only ever move actual_departure_time/confirmation_channel, never
-- reassign themselves to a different project/vehicle) isn't enforced here
-- — the same "policy doesn't restrict which columns an authorized writer
-- touches" trust level already applies to every other `for all`
-- owner/manager policy in this schema. Worth a trigger-based hardening
-- pass later; out of scope for this migration.
create policy "dispatch_assignments_select_self" on dispatch_assignments
  for select using (is_own_worker(worker_id));
create policy "dispatch_assignments_update_self" on dispatch_assignments
  for update using (is_own_worker(worker_id)) with check (is_own_worker(worker_id));

-- attendance_records: self-select (salary strip, salary view) + self-insert
-- restricted to source='dispatch_checkin' with recorded_by left null — a
-- worker can record their own dispatch check-in but can never write a
-- 'manual_pointage' row (that stays owner/manager-only, per Doc 01 §1.14.3
-- — manual attendance is a contractor action) or attribute the row to
-- someone else via recorded_by.
create policy "attendance_records_select_self" on attendance_records
  for select using (is_own_worker(worker_id));
create policy "attendance_records_insert_self" on attendance_records
  for insert with check (
    is_own_worker(worker_id)
    and source = 'dispatch_checkin'
    and recorded_by is null
  );

-- advances: self-select only. Self-insert deliberately NOT granted here —
-- request_advance() below is the only sanctioned way a worker creates an
-- advance row, so the idempotency/request-hash flow can't be bypassed by a
-- plain client insert.
create policy "advances_select_self" on advances
  for select using (is_own_worker(worker_id));

-- salary_cycles: self-select only, for the same reason — writes go through
-- mark_salary_cycle_paid() (contractor-only anyway) or the plain
-- owner/manager upsert already permitted by advances_write_owner_manager's
-- sibling policy on this table.
create policy "salary_cycles_select_self" on salary_cycles
  for select using (is_own_worker(worker_id));

-- ---------------------------------------------------------------------------
-- Part 2 — money-moving RPCs (Doc 01 §1.11 idempotency flow)
-- ---------------------------------------------------------------------------

-- create_advance: contractor directly recording cash already handed to a
-- worker (Doc 03 §3.14's quick-tap chip flow) — this is a fait accompli,
-- not a request, so it's inserted as 'approved' immediately.
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

  insert into advances (org_id, worker_id, amount, reason, status, approved_by, idempotency_key)
  values (p_org_id, p_worker_id, p_amount, p_reason, 'approved', auth.uid(), p_idempotency_key)
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, p_org_id, 'create_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

grant execute on function create_advance(uuid, uuid, numeric, text, uuid) to authenticated;

comment on function create_advance(uuid, uuid, numeric, text, uuid) is
  'Doc 03 §3.14 — contractor quick-advance. Owner/manager only. Idempotency-checked against idempotency_keys (Doc 01 §1.11): a replay with the same key+payload returns the original row rather than inserting twice; a reused key with a different payload raises rather than silently processing under the old key.';

-- request_advance: worker-initiated (Doc 03 §4.4) — always 'pending', the
-- worker's own account resolved from workers.user_id = auth.uid(), no
-- org_id/worker_id parameter accepted from the client so a worker can never
-- request an advance against a different worker's record.
create or replace function request_advance(
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

  insert into advances (org_id, worker_id, amount, reason, status, requested_by, idempotency_key)
  values (v_worker.org_id, v_worker.id, p_amount, p_reason, 'pending', auth.uid(), p_idempotency_key)
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'request_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

grant execute on function request_advance(numeric, text, uuid) to authenticated;

comment on function request_advance(numeric, text, uuid) is
  'Doc 03 §4.4 — worker advance request. Always inserts status=pending; the calling worker is resolved server-side from workers.user_id=auth.uid(), never trusted as a parameter. Same idempotency-replay contract as create_advance.';

-- approve_advance: contractor approving a worker-submitted pending request
-- (the counterpart request_advance() needs — Doc 03 §3.14 describes the
-- contractor-initiated flow in detail but doesn't spell out the approval
-- step for a worker-initiated one; approveAdvanceSchema already existed in
-- packages/validation, so this closes that loop rather than leaving
-- worker-submitted requests with nowhere to go).
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

  if org_role_of(v_target.org_id) not in ('owner', 'manager') then
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

grant execute on function approve_advance(uuid, uuid) to authenticated;

comment on function approve_advance(uuid, uuid) is
  'Approves a pending worker-submitted advance request. Owner/manager only, idempotency-checked. Rejection is NOT idempotency-gated (Doc 01 §1.11.3 only lists creation/approval as mandatory) and goes through a plain client-side update under the existing advances_write_owner_manager policy instead.';

-- mark_salary_cycle_paid: the other Doc 03 §3.14 "non-negotiable" idempotent
-- action. Expects the salary_cycles row to already exist (the mobile
-- Advances screen upserts the current cycle's row client-side — a plain
-- insert-if-missing under the existing owner/manager RLS policy, no RPC
-- needed for that step since it isn't itself a money-moving write).
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

  if org_role_of(v_target.org_id) not in ('owner', 'manager') then
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

grant execute on function mark_salary_cycle_paid(uuid, uuid) to authenticated;

comment on function mark_salary_cycle_paid(uuid, uuid) is
  'Doc 03 §3.14 — "Marquer comme payé." Owner/manager only, idempotency-checked so a double-tap or a retried request after a timeout can never double-process a payment confirmation.';

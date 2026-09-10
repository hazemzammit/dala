-- =============================================================================
-- 0090_advances_manager_reason_persistence.sql
-- Ref: docs/DALA_GAPS_AND_FIXES_PLAN.md §1.12, docs/spec/05-design-system-
-- and-ux-spec.md §1.7c (Tier 3) — Phase 19F.
--
-- Closes the reason-persistence gap named during 19C-19E: Advances'
-- Approve/Reject/Mark-as-Paid actions gate through a typed-confirmation
-- dialog (Tier 3), but there was nowhere server-side for the mandatory
-- reason half of that dialog to go. This migration is strictly additive —
-- new nullable columns, new function signatures alongside (then replacing)
-- the old ones. No existing row is touched or required to backfill
-- anything; every advance/salary-cycle created before this migration simply
-- has `manager_reason`/`paid_reason` = null, same as any other historical
-- record predating a later-added optional column.
--
-- NAMING: deliberately `manager_reason` / `paid_reason`, never `reason` —
-- `advances.reason` already exists and is the WORKER's own stated reason
-- for requesting the advance (populated at creation, mobile's
-- advance-request.tsx). Reusing that column for the manager's
-- approval/rejection reason would silently overwrite the worker's own
-- words with the manager's — a real data-integrity bug, not a shortcut.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. New columns — additive, nullable, no default-backfill needed.
-- ---------------------------------------------------------------------------
alter table advances
  add column if not exists manager_reason text;
comment on column advances.manager_reason is
  'Reason given by the approving/rejecting manager (Doc 05 §1.7c Tier 3). '
  'Distinct from advances.reason, which is the worker''s own stated reason '
  'for requesting the advance at creation time. Null for any row created '
  'before migration 0090 or approved/rejected via a client predating this '
  'change.';

alter table salary_cycles
  add column if not exists paid_reason text;
comment on column salary_cycles.paid_reason is
  'Reason given by the manager when marking this cycle as paid (Doc 05 '
  '§1.7c Tier 3). Null for any cycle marked paid before migration 0090.';

-- ---------------------------------------------------------------------------
-- 2. approve_advance — add p_reason. Mandatory in practice (raises if
-- missing/too short), matching the 10-character minimum the shared
-- ConfirmTypingDialog (packages/ui-web) already enforces client-side for
-- Admin's own Tier 3 actions — this is the server-side half of that same
-- contract, not a new rule invented here. Kept as a trailing `default null`
-- parameter (rather than a bare required arg) purely so `create or replace`
-- semantics are unambiguous about which overload is being replaced; the
-- validation below means a call omitting it will simply fail, so there is
-- no real "reason optional" path in practice.
--
-- Signature change means this DROPs the old 2-arg overload first — every
-- caller in this codebase is updated in this same phase (mobile
-- advances.tsx, web actions.ts), so no caller is left depending on the old
-- shape. This is an internal RPC with no external/third-party consumers
-- (Doc 01 §1.5), so retiring the old overload outright is safe and avoids
-- leaving a second, reason-less approval path silently reachable.
-- ---------------------------------------------------------------------------
drop function if exists approve_advance(uuid, uuid);

create function approve_advance(
  p_advance_id uuid,
  p_idempotency_key uuid,
  p_reason text default null
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

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_required';
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
  set status = 'approved', approved_by = auth.uid(), manager_reason = p_reason
  where id = p_advance_id
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_target.org_id, 'approve_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$$;

revoke execute on function approve_advance(uuid, uuid, text) from public;
grant execute on function approve_advance(uuid, uuid, text) to authenticated;

comment on function approve_advance(uuid, uuid, text) is
  'Doc 01 §1.11 idempotent approval RPC. p_reason is mandatory in practice '
  '(raises reason_required below 10 chars) — Doc 05 §1.7c Tier 3. '
  'Superseded approve_advance(uuid, uuid) in migration 0090.';

-- ---------------------------------------------------------------------------
-- 3. mark_salary_cycle_paid — same pattern as approve_advance above.
-- ---------------------------------------------------------------------------
drop function if exists mark_salary_cycle_paid(uuid, uuid);

create function mark_salary_cycle_paid(
  p_salary_cycle_id uuid,
  p_idempotency_key uuid,
  p_reason text default null
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

  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'reason_required';
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
  set status = 'paid', paid_at = now(), idempotency_key = p_idempotency_key, paid_reason = p_reason
  where id = p_salary_cycle_id
  returning * into v_cycle;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_target.org_id, 'mark_salary_cycle_paid', v_request_hash, 200, jsonb_build_object('id', v_cycle.id));

  return v_cycle;
end;
$$;

revoke execute on function mark_salary_cycle_paid(uuid, uuid, text) from public;
grant execute on function mark_salary_cycle_paid(uuid, uuid, text) to authenticated;

comment on function mark_salary_cycle_paid(uuid, uuid, text) is
  'Doc 01 §1.11 idempotent mark-paid RPC. p_reason is mandatory in practice '
  '(raises reason_required below 10 chars) — Doc 05 §1.7c Tier 3. '
  'Superseded mark_salary_cycle_paid(uuid, uuid) in migration 0090.';

-- ---------------------------------------------------------------------------
-- 4. Reject — deliberately NOT turned into a new RPC. Rejection isn't in
-- Doc 01 §1.11.3's mandatory-idempotency list (only creation/approval/
-- mark-paid are — mobile's own advances.tsx comment on handleRejectConfirmed
-- says this explicitly), so the existing plain-`.update()`-under-RLS shape
-- is the right one, same as Materials' own reject flow (materials.tsx +
-- materials.rejection_reason — verified in §5 below to already work this
-- way correctly). advances_write_owner_manager already covers writing
-- manager_reason (`for all using (org_role_of(org_id) in ('owner',
-- 'manager'))`) — no RLS change needed. The mandatory-length check for
-- reject's reason is enforced client-side only (zod schema, mirroring
-- refuseMaterialSchema's own pattern), not at the DB layer — consistent
-- with how Materials' reject already works, and it's not a money-moving
-- write in the idempotency sense, so it doesn't need the same
-- SECURITY DEFINER server-side gate approve/mark-paid get.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Materials.tsx reject-reason audit (part of this same gap, per Phase
-- 19F instructions): materials.rejection_reason is a real column (migration
-- 0008), and apps/mobile/src/app/(contractor)/materials.tsx's handleRefuse
-- writes it via `.update({ status: 'rejected', rejection_reason:
-- parsed.data.rejection_reason })` and detail.rejection_reason is read back
-- and displayed. CONFIRMED already correctly wired — not a second instance
-- of this gap. No migration action needed for materials; noted here only
-- so this investigation is on record.
-- ---------------------------------------------------------------------------

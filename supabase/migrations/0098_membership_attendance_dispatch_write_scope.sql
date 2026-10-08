-- =============================================================================
-- 0098_membership_attendance_dispatch_write_scope.sql
--
-- Audit findings P1-E / P1-F: write policies that checked only "is this user
-- allowed to write this table" and not "is the row consistent".
--
-- 1. organization_members — the owner's ALL policy let an owner INSERT/UPDATE/
--    DELETE membership rows directly, bypassing update_organization_member_role
--    / remove_organization_member. Reproduced: an owner deleted themselves as
--    the last owner (org orphaned), demoted themselves (zero owners) and
--    force-added an arbitrary user with no invitation. Every legitimate write
--    already goes through a SECURITY DEFINER RPC (create_organization_for_
--    current_user, update_organization_member_role, remove_organization_member,
--    accept_organization_member_invitation) or a service-role Edge Function, so
--    client write access is removed entirely.
--
-- 2. attendance_records
--    - INSERT was open to ANY org member incl. viewers, for any worker_id
--      (even another org's) and any org_id. Now owner/manager only.
--    - a worker's own check-in could be stamped with a foreign org_id or a
--      date far in the future. Now the row's org must be the worker's org and
--      record_date may not be later than tomorrow (no lower bound on purpose:
--      an offline phone may sync days later, and a rejected row wedges sync).
--    - composite FK (worker_id, org_id) -> workers(id, org_id) so the database
--      itself refuses cross-tenant references. Added NOT VALID: enforced for
--      every new/changed row without failing on legacy rows; run
--      `alter table ... validate constraint ...` after cleaning them.
--
-- 3. dispatch_assignments
--    - a worker could UPDATE every column of their own assignment (project,
--      date, vehicle...). A trigger now limits non-owner/manager updates to
--      actual_departure_time, confirmation_channel (+ version/updated_at,
--      which the sync layer maintains).
--    - composite FKs bind worker_id and vehicle_id to the assignment's org.
--
-- Deliberately NOT done: a UNIQUE(worker_id, record_date, source) on
-- attendance. Legacy duplicates would fail the migration, and a second offline
-- check-in (different client id) would then be rejected by the sync push and
-- wedge the queue. Needs a data audit + client-side handling first.
-- =============================================================================

-- 1. organization_members ------------------------------------------------------
drop policy if exists organization_members_write_owner on public.organization_members;
revoke insert, update, delete on public.organization_members from anon, authenticated;

-- 2. attendance_records --------------------------------------------------------
alter table public.workers  add constraint workers_id_org_id_key  unique (id, org_id);
alter table public.vehicles add constraint vehicles_id_org_id_key unique (id, org_id);

alter table public.attendance_records
  add constraint attendance_records_worker_org_fk
  foreign key (worker_id, org_id) references public.workers (id, org_id) not valid;

drop policy if exists attendance_records_insert_member on public.attendance_records;
create policy attendance_records_insert_member on public.attendance_records
  for insert to public
  with check (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'));

drop policy if exists attendance_records_insert_self on public.attendance_records;
create policy attendance_records_insert_self on public.attendance_records
  for insert to public
  with check (
    public.is_own_worker(worker_id)
    and source = 'dispatch_checkin'
    and recorded_by is null
    and record_date <= current_date + 1
    and exists (
      select 1 from public.workers w
      where w.id = attendance_records.worker_id
        and w.org_id = attendance_records.org_id
    )
  );

-- 3. dispatch_assignments ------------------------------------------------------
alter table public.dispatch_assignments
  add constraint dispatch_assignments_worker_org_fk
  foreign key (worker_id, org_id) references public.workers (id, org_id) not valid,
  add constraint dispatch_assignments_vehicle_org_fk
  foreign key (vehicle_id, org_id) references public.vehicles (id, org_id) not valid;

create or replace function public.dispatch_assignments_guard_worker_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_editable constant text[] :=
    array['actual_departure_time', 'confirmation_channel', 'version', 'updated_at'];
begin
  -- service role / system writes and owners/managers may change anything.
  if auth.uid() is null
     or coalesce(public.org_role_of(old.org_id), 'none') in ('owner', 'manager') then
    return new;
  end if;

  if (to_jsonb(new) - v_editable) is distinct from (to_jsonb(old) - v_editable) then
    raise exception 'dispatch_assignment_field_not_editable' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.dispatch_assignments_guard_worker_update()
  from public, anon, authenticated;

drop trigger if exists dispatch_assignments_guard_worker_update on public.dispatch_assignments;
create trigger dispatch_assignments_guard_worker_update
  before update on public.dispatch_assignments
  for each row execute function public.dispatch_assignments_guard_worker_update();

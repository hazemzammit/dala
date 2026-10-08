-- =============================================================================
-- 0097_sync_tombstones_and_server_time.sql
--
-- Offline-sync fixes (audit: mobile sync).
--
-- 1. Deletes never reached devices. pullChanges.ts hard-coded `deleted: []`
--    on the stated premise that no synced table is ever hard-deleted. That is
--    false: owners/managers can DELETE dispatch_assignments (0020 policy),
--    materials and advances (ALL policies; the web app deletes materials), and
--    site_logs/others cascade from projects/organizations. A deleted row stayed
--    on every already-synced phone forever (e.g. a cancelled dispatch a worker
--    could still "check in" to).
--    -> sync_tombstones records (table, id, org) for every hard delete of a
--       synced table via an AFTER DELETE trigger; the client pulls tombstones
--       newer than its cursor into WatermelonDB's `deleted` bucket.
--       Retention: rows are tiny; keep them >= 180 days (a device offline
--       longer than the retention window must be re-installed/re-synced).
--       No purge job is created here.
--
-- 2. The pull cursor was the DEVICE clock (Date.now()). A phone whose clock is
--    ahead skips every server change made in the gap, permanently.
--    -> get_server_time() gives the client a server-side clock to build the
--       cursor from.
-- =============================================================================

create table if not exists public.sync_tombstones (
  id          bigint generated always as identity primary key,
  table_name  text        not null
              check (table_name in ('dispatch_assignments','attendance_records','advances','materials','site_logs')),
  record_id   uuid        not null,
  org_id      uuid        not null,
  deleted_at  timestamptz not null default clock_timestamp()
);

-- No FK to organizations: an org delete cascades into the synced tables and
-- must still be able to leave tombstones behind.
create index if not exists sync_tombstones_org_cursor_idx
  on public.sync_tombstones (org_id, deleted_at, id);

alter table public.sync_tombstones enable row level security;

revoke all on public.sync_tombstones from anon, authenticated;
grant select on public.sync_tombstones to authenticated;

-- Same audience that can pull the underlying rows: org members, and workers
-- (who have no organization_members row) of that org.
create policy sync_tombstones_select_org on public.sync_tombstones
  for select to authenticated
  using (
    public.is_org_member(org_id)
    or exists (
      select 1 from public.workers w
      where w.user_id = auth.uid() and w.org_id = sync_tombstones.org_id
    )
  );

create or replace function public.sync_record_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sync_tombstones (table_name, record_id, org_id)
  values (tg_table_name, old.id, old.org_id);
  return old;
end;
$$;

revoke execute on function public.sync_record_tombstone() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['dispatch_assignments','attendance_records','advances','materials','site_logs']
  loop
    execute format('drop trigger if exists sync_tombstone_after_delete on public.%I', t);
    execute format(
      'create trigger sync_tombstone_after_delete after delete on public.%I
         for each row execute function public.sync_record_tombstone()', t);
  end loop;
end $$;

-- Server-side clock for the pull cursor ---------------------------------------
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$ select clock_timestamp() $$;

revoke execute on function public.get_server_time() from public, anon;
grant execute on function public.get_server_time() to authenticated, service_role;

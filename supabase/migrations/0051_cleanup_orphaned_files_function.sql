-- =============================================================================
-- 0051_cleanup_orphaned_files_function.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.8
--
-- Doc 04 §4.3.8 (Storage Monitor) calls for "orphaned-file cleanup action
-- (runs the cleanup_orphaned_files scheduled job on demand)" -- but no such
-- function or scheduled job exists anywhere in this repo (confirmed: not
-- in any migration, not as an Edge Function, only ever mentioned in
-- comments as a not-yet-built pre-existing gap -- see 0010's and 0026's
-- own header comments). This migration builds it for real rather than
-- wiring an admin button to something that still doesn't exist.
--
-- "Orphaned" is defined narrowly and conservatively here: a storage.objects
-- row in the 'org-files' bucket whose leading path segment (the org_id,
-- per the {org_id}/{category}/{uuid}.{ext} convention established in 0020)
-- does not correspond to any existing organizations.id row, OR whose
-- leading path segment isn't even a well-formed UUID at all (a malformed/
-- garbage upload that could never have belonged to a real org). This is
-- deliberately NOT "any file belonging to a suspended or soft-deleted
-- org" -- suspended orgs keep their data by definition (Doc 04 §4.3.3:
-- suspend "blocks login, doesn't delete data") and soft-deleted orgs have
-- a stated 30-day recovery window (same section) during which their files
-- must survive a cleanup pass. Nothing in this repo currently hard-deletes
-- an organizations row at all, so in practice this targets malformed
-- uploads and any future hard-delete path, not a live purge of recently
-- soft-deleted orgs' data.
--
-- Callable on demand (Doc 04 §4.3.8 explicitly wants a synchronous
-- "run now" admin action, not only a cron path) -- apps/admin's Storage
-- Monitor screen calls this directly via a service-role route handler,
-- same access pattern as admin_storage_usage_by_org() (0026).
-- =============================================================================

create or replace function cleanup_orphaned_files()
returns table (deleted_count bigint, freed_bytes bigint)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_deleted_count bigint;
  v_freed_bytes bigint;
begin
  with orphaned as (
    select o.id
    from storage.objects o
    where o.bucket_id = 'org-files'
      and (
        (storage.foldername(o.name))[1] !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (
          select 1 from organizations org
          where org.id = (storage.foldername(o.name))[1]::uuid
        )
      )
  ),
  removed as (
    delete from storage.objects so
    using orphaned
    where so.id = orphaned.id
    returning coalesce(((so.metadata ->> 'size'))::bigint, 0) as size
  )
  select count(*)::bigint, coalesce(sum(size), 0)::bigint
  into v_deleted_count, v_freed_bytes
  from removed;

  return query select v_deleted_count, v_freed_bytes;
end;
$$;

revoke all on function cleanup_orphaned_files() from public, anon, authenticated;
grant execute on function cleanup_orphaned_files() to service_role;

comment on function cleanup_orphaned_files() is
  'Doc 04 §4.3.8 Storage Monitor -- deletes storage.objects rows in the
   org-files bucket with no corresponding organizations row (malformed
   path or the org no longer exists). service_role only -- called from
   apps/admin''s service-role route handler on admin demand, never a
   client query, never scheduled via cron (this repo has no cron trigger
   for it, by design -- see this migration''s header).';

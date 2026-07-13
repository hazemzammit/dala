-- =============================================================================
-- 0013_soft_delete.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.16
-- projects.deleted_at already exists (0006). This adds the restore window
-- and the scheduled purge, so "delete" is recoverable for 30 days before
-- it's actually gone.
-- =============================================================================

-- Normal reads should exclude soft-deleted rows by default. Rather than
-- repeat "and deleted_at is null" in every query, expose a view.
create or replace view active_projects as
  select * from projects where deleted_at is null;

create or replace function soft_delete_project(p_project_id uuid)
returns void language sql as $$
  update projects set deleted_at = now() where id = p_project_id;
$$;

create or replace function restore_project(p_project_id uuid)
returns void language sql as $$
  update projects set deleted_at = null
  where id = p_project_id and deleted_at > now() - interval '30 days';
$$;

-- Scheduled job (see docs/spec/01 §1.13's scheduled_job_runs table): purges
-- anything soft-deleted for more than 30 days. Invoked by a Supabase cron
-- Edge Function, wrapped in scheduled_job_runs bookkeeping at the call site.
create or replace function purge_soft_deleted_records()
returns integer language plpgsql as $$
declare
  purged_count integer;
begin
  delete from projects where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics purged_count = row_count;
  return purged_count;
end;
$$;

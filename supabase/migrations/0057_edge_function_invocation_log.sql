-- =============================================================================
-- 0057_edge_function_invocation_log.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.13
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.9
--
-- Admin remediation Tier 2.1 — closes the literal Doc 06 §6.3 gap: a table
-- + UI for Edge Function invocation history. Distinct from
-- scheduled_job_runs (0013's pattern, extended by every cron job since):
-- that table only ever gets a row from a job a pg_cron tick invoked.
-- Nothing in this repo logs a row for a synchronous, user-triggered Edge
-- Function call (send-organization-invitation-email, generate-report,
-- etc.) — this table is that missing half, not a replacement for
-- scheduled_job_runs.
--
-- service_role only — same access-pattern reasoning as service_health_checks
-- (0032): every write comes from inside an Edge Function on the
-- service-role client; no authenticated end-user client should ever read
-- or write this table directly, apps/admin reads it through its own
-- server-side route (service-role key never reaches a browser).
--
-- Retention: flat 90 days, no security-tier distinction. Unlike audit_log
-- (0053), an invocation row is operational/debugging signal (did this
-- function run, how long did it take, did it error) rather than a
-- security-relevant "who did what" record — there's no equivalent of
-- audit_log's 1-year security-event tier to carve out here.
-- =============================================================================

create table edge_function_invocations (
  id            uuid primary key default gen_random_uuid(),
  function_name text not null,
  status        text not null check (status in ('success', 'error')),
  duration_ms   integer,
  error_message text,
  org_id        uuid references organizations(id),
  invoked_at    timestamptz not null default now()
);

create index edge_function_invocations_name_time_idx
  on edge_function_invocations (function_name, invoked_at desc);

alter table edge_function_invocations enable row level security;

-- No policy for anon/authenticated at all — service_role bypasses RLS
-- entirely, and there is deliberately no case where an end-user client
-- should read this table directly (matches service_health_checks' own
-- "no anon/authenticated policy" choice in 0032).
revoke all on edge_function_invocations from public, anon, authenticated;
grant select, insert on edge_function_invocations to service_role;

create or replace function cleanup_edge_function_invocations()
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count bigint;
  v_job_run_id uuid;
begin
  insert into scheduled_job_runs (job_name, status)
  values ('edge_function_invocations_retention_cleanup', 'running')
  returning id into v_job_run_id;

  with removed as (
    delete from edge_function_invocations
    where invoked_at < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_deleted_count from removed;

  update scheduled_job_runs
  set status = 'success', completed_at = now()
  where id = v_job_run_id;

  return query select v_deleted_count;
exception when others then
  update scheduled_job_runs
  set status = 'failed', completed_at = now(), error_message = sqlerrm
  where id = v_job_run_id;
  raise;
end;
$$;

revoke all on function cleanup_edge_function_invocations() from public, anon, authenticated;
grant execute on function cleanup_edge_function_invocations() to service_role, postgres;

comment on function cleanup_edge_function_invocations() is
  'Flat 90-day retention for edge_function_invocations. See this
   migration''s header for why there is no security-event tier here
   (unlike cleanup_audit_log_retention()).';

-- Pure-SQL pg_cron schedule, same pattern as 0053 (audit_log retention) —
-- a plain DELETE comfortably handles this table's expected row volume in
-- one transaction, no Edge Function needed just to run the cleanup itself.
select cron.schedule(
  'edge-function-invocations-retention-cleanup-daily',
  '45 3 * * *', -- 03:45 UTC daily — staggered 15 min after 0053's 03:30 job
  $$select cleanup_edge_function_invocations();$$
);

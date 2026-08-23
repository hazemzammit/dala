-- =============================================================================
-- 0062_platform_metrics_daily.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.2
--
-- Admin remediation Tier 4.5, Phase A only — historical snapshots, the
-- explicit prerequisite for any trend chart. Phase B (actual charts, a
-- time-range selector, a charting library) is deliberately NOT part of
-- this migration or this session — per the plan's own instruction, this
-- needs to accumulate real data for at least a few weeks before a trend
-- chart built on it would show anything more meaningful than the
-- Dashboard's existing single-number cards. Shipping Phase B against an
-- empty or 3-row table would be the same "looks real, isn't" problem this
-- whole remediation effort has been fixing everywhere else.
--
-- Every column here mirrors a number the Dashboard (apps/admin/src/app/
-- (admin)/dashboard/page.tsx) already computes and displays — this
-- migration does not introduce any new metric definition, it snapshots
-- the exact same definitions that page already uses (same "active org" =
-- suspended_at/deleted_at both null; same MRR = active org + current
-- cycle + paid, matching Billing's own definition too) so the eventual
-- Phase B chart can never quietly disagree with the Dashboard's own
-- current-day number.
-- =============================================================================

create table platform_metrics_daily (
  snapshot_date     date primary key,
  org_count         integer not null,
  active_org_count  integer not null,
  user_count        integer not null,
  mrr_millimes      bigint not null,
  storage_bytes     bigint not null,
  project_count     integer not null,
  site_log_count    integer not null,
  expense_count     integer not null,
  created_at        timestamptz not null default now()
);

alter table platform_metrics_daily enable row level security;

-- service_role only — same reasoning as service_health_checks (0032) and
-- edge_function_invocations (0057): every write comes from the scheduled
-- function below, apps/admin reads it through its own server-side route
-- (once Phase B builds one), no end-user client ever touches this table.
revoke all on platform_metrics_daily from public, anon, authenticated;
grant select, insert, update on platform_metrics_daily to service_role;

create or replace function snapshot_platform_metrics()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_run_id uuid;
begin
  insert into scheduled_job_runs (job_name, status)
  values ('snapshot_platform_metrics', 'running')
  returning id into v_job_run_id;

  -- on conflict: safely re-runnable within the same day (a manual
  -- trigger, or the cron tick somehow firing twice) overwrites that
  -- day's row with a fresh computation rather than erroring or
  -- duplicating — one row per calendar day is the actual invariant this
  -- table needs, not "insert exactly once, ever."
  insert into platform_metrics_daily (
    snapshot_date, org_count, active_org_count, user_count, mrr_millimes,
    storage_bytes, project_count, site_log_count, expense_count
  )
  select
    current_date,
    (select count(*) from organizations),
    (select count(*) from organizations where suspended_at is null and deleted_at is null),
    (select count(*) from profiles),
    -- Same "active org, current cycle, paid" definition as Dashboard's
    -- own page.tsx and api/admin/billing/route.ts — kept in sync
    -- deliberately, not independently re-derived.
    coalesce((
      select sum(bc.amount_millimes)
      from billing_cycles bc
      join organizations o on o.id = bc.org_id
      where o.subscription_status = 'active'
        and bc.status = 'paid'
        and bc.cycle_start <= current_date
        and bc.cycle_end >= current_date
    ), 0),
    -- Reuses admin_storage_usage_by_org() (0026) — same RPC Storage
    -- Monitor, the Organizations list, and Dashboard's own card all call,
    -- not a fourth independent aggregation of storage.objects.
    coalesce((select sum(total_bytes) from admin_storage_usage_by_org()), 0),
    (select count(*) from projects),
    (select count(*) from site_logs),
    (select count(*) from project_expenses)
  on conflict (snapshot_date) do update set
    org_count = excluded.org_count,
    active_org_count = excluded.active_org_count,
    user_count = excluded.user_count,
    mrr_millimes = excluded.mrr_millimes,
    storage_bytes = excluded.storage_bytes,
    project_count = excluded.project_count,
    site_log_count = excluded.site_log_count,
    expense_count = excluded.expense_count;

  update scheduled_job_runs
  set status = 'success', completed_at = now()
  where id = v_job_run_id;
exception when others then
  update scheduled_job_runs
  set status = 'failed', completed_at = now(), error_message = sqlerrm
  where id = v_job_run_id;
  raise;
end;
$$;

revoke all on function snapshot_platform_metrics() from public, anon, authenticated;
grant execute on function snapshot_platform_metrics() to service_role, postgres;

comment on function snapshot_platform_metrics() is
  'Doc 04 §4.3.2 / admin remediation Tier 4.5 Phase A. Snapshots the exact
   metric definitions apps/admin''s Dashboard page already computes into
   platform_metrics_daily, once per calendar day. Phase B (trend charts
   built on this table) is a deliberate, separate follow-up — see this
   migration''s header.';

-- Pure-SQL pg_cron schedule, same pattern as 0053/0057 (a plain INSERT
-- comfortably handles this in one transaction, no Edge Function needed).
-- 05:00 UTC — after 0053 (03:30) and 0057 (03:45), and safely before
-- Tunisia's business day starts, so the day's snapshot reflects a quiet-
-- hours state rather than racing live traffic.
select cron.schedule(
  'snapshot-platform-metrics-daily',
  '0 5 * * *',
  $$select snapshot_platform_metrics();$$
);

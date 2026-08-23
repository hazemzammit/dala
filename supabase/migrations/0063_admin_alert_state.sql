-- =============================================================================
-- 0063_admin_alert_state.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.9
--
-- Admin remediation Tier 4.6 — proactive alerting. The debounce state the
-- plan describes ("an alerted_at column... cleared once the service
-- recovers") can't live directly on service_health_checks or
-- scheduled_job_runs: both are append-only history tables — a new row
-- every 5-minute tick / every job run — so there's no single row to carry
-- a persistent "have we already alerted for this ongoing incident" flag.
-- This is a small separate state table instead: one row per monitored
-- entity (service or job), updated in place, not appended to.
--
-- entity_type/entity_name together mirror MONITORED_SERVICES/MONITORED_JOBS
-- in api/admin/services-health/route.ts — kept as plain text with no FK
-- (those are TypeScript arrays, not DB-enumerated tables), same reasoning
-- ScheduledJobRun's own job_name already uses.
-- =============================================================================

create table admin_alert_state (
  entity_type  text not null check (entity_type in ('service', 'job')),
  entity_name  text not null,
  alerted_at   timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (entity_type, entity_name)
);

alter table admin_alert_state enable row level security;

-- service_role only — written exclusively by ping-service-health; no
-- admin-facing route reads this directly (it's alerting plumbing, not
-- something the Services Health screen needs to display — the screen
-- already shows current up/down status and job pass/fail directly from
-- the two real history tables).
revoke all on admin_alert_state from public, anon, authenticated;
grant select, insert, update on admin_alert_state to service_role;

comment on table admin_alert_state is
  'Doc 04 §4.3.9 / admin remediation Tier 4.6. One row per monitored
   service or job. alerted_at set when a down/failure alert fires, cleared
   (set to null) on recovery — this is what stops a sustained outage from
   re-alerting every 5 minutes: see ping-service-health/index.ts for the
   actual debounce logic that reads and writes this table.';

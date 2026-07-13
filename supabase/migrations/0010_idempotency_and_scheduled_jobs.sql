-- =============================================================================
-- 0010_idempotency_and_scheduled_jobs.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.11, §1.13
-- =============================================================================

create table idempotency_keys (
  key             uuid primary key,             -- client-generated
  org_id          uuid not null references organizations(id),
  endpoint        text not null,
  request_hash    text not null,                 -- detects a reused key with different data
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz not null default now()
);

comment on table idempotency_keys is
  'Mandatory on every money-moving mutation: advance creation/approval, "mark cycle as paid," Konnect payment-initiation, invoice generation. Retained 24h then purged by a scheduled job. Doc 01 §1.11.';

create index idempotency_keys_org_id_idx on idempotency_keys (org_id);

create table scheduled_job_runs (
  id            uuid primary key default gen_random_uuid(),
  job_name      text not null,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'running' check (status in ('running', 'success', 'failed')),
  error_message text,
  retry_count   integer not null default 0
);

comment on table scheduled_job_runs is
  'Every scheduled job (expire_invitations, send_payment_reminders, weekly_salary_summaries, cleanup_orphaned_files, purge_idempotency_keys) wraps its run in this table. No job fails silently. Doc 01 §1.13.';

create index scheduled_job_runs_job_name_idx on scheduled_job_runs (job_name, started_at desc);

-- Only service-role (Edge Functions) ever touches these two tables directly.
alter table idempotency_keys enable row level security;
alter table scheduled_job_runs enable row level security;

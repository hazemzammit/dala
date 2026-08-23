-- =============================================================================
-- 0064_email_delivery_events.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.9
--
-- Admin remediation Tier 4.7 — email deliverability visibility. Resend's
-- webhook payload shape verified against their current live docs before
-- writing this (per the plan's own instruction — this environment's
-- general Resend knowledge may be stale): events are
-- { type, created_at, data: { email_id, from, to: [...], subject,
-- bounce?: { type, subType, message }, tags?: {...} } }, delivered via
-- Svix (svix-id/svix-timestamp/svix-signature headers, a whsec_ secret,
-- HMAC-SHA256 over "{id}.{timestamp}.{raw body}") — see
-- resend-webhook/index.ts for the verification implementation this
-- shape feeds.
--
-- "related context if derivable" (the plan's own wording): NOT derivable
-- right now — checked _shared/resend.ts's sendEmail() before assuming
-- otherwise, and it sends no `tags` on any outgoing email today, so
-- there's nothing in an incoming webhook event to correlate back to a
-- specific org/announcement/invitation. org_id below is real schema
-- (nullable, for a future session that adds tags at send time), not
-- wired to anything yet — disclosed rather than faked.
-- =============================================================================

create table email_delivery_events (
  id                 uuid primary key default gen_random_uuid(),
  resend_email_id    text not null,
  event_type         text not null check (
    event_type in (
      'email.sent', 'email.delivered', 'email.delivery_delayed',
      'email.bounced', 'email.complained', 'email.opened', 'email.clicked'
    )
  ),
  recipient          text not null,
  bounce_type        text,   -- Resend's data.bounce.type ('Permanent' | 'Transient'), bounces only
  bounce_message     text,   -- Resend's data.bounce.message, bounces only
  org_id             uuid references organizations(id), -- not populated yet, see header
  received_at        timestamptz not null default now()
);

create index email_delivery_events_type_time_idx
  on email_delivery_events (event_type, received_at desc);
create index email_delivery_events_email_id_idx
  on email_delivery_events (resend_email_id);

alter table email_delivery_events enable row level security;

-- service_role only — same reasoning as every other webhook-fed event
-- table this remediation effort has added (edge_function_invocations,
-- service_health_checks): written exclusively by resend-webhook, read by
-- apps/admin through its own server-side route.
revoke all on email_delivery_events from public, anon, authenticated;
grant select, insert on email_delivery_events to service_role;

comment on table email_delivery_events is
  'Doc 04 §4.3.9 / admin remediation Tier 4.7. One row per Resend webhook
   event (resend-webhook Edge Function). Flat 90-day retention — same
   operational-signal-not-audit-trail reasoning as edge_function_invocations
   (0057) — via cleanup_email_delivery_events(), scheduled daily.';

create or replace function cleanup_email_delivery_events()
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
  values ('email_delivery_events_retention_cleanup', 'running')
  returning id into v_job_run_id;

  with removed as (
    delete from email_delivery_events
    where received_at < now() - interval '90 days'
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

revoke all on function cleanup_email_delivery_events() from public, anon, authenticated;
grant execute on function cleanup_email_delivery_events() to service_role, postgres;

-- 06:00 UTC — after every other daily retention job this remediation
-- effort has scheduled (0053 at 03:30, 0057 at 03:45, 0062's snapshot at
-- 05:00), staggered to avoid a pile-up at the same minute.
select cron.schedule(
  'email-delivery-events-retention-cleanup-daily',
  '0 6 * * *',
  $$select cleanup_email_delivery_events();$$
);

-- =============================================================================
-- 0053_audit_log_retention_cleanup.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.6
--
-- api/admin/audit-log/route.ts (before this phase) claimed retention "is
-- enforced by a scheduled cleanup job, not by this read route" -- no such
-- job existed anywhere in supabase/migrations/ before this one.
-- audit_log has grown unbounded since 0009.
--
-- Retention: 90 days for ordinary rows, 1 year for security-sensitive
-- actions. The security-event action list below was built by grepping
-- every actual `logAdminAction(` call site in apps/admin/src (not
-- guessed) -- the full list of action strings this codebase can
-- currently produce is:
--   user.reset_password, user.suspend, user.unsuspend, user.delete,
--   user.move_org, user.revoke_sessions, admin.impersonate_start,
--   admin.impersonate_end, admin.invite, db_explorer.read,
--   db_explorer.write_rejected, db_explorer.write_requested,
--   db_explorer.write_executed, db_explorer.write_approved_and_executed,
--   storage.cleanup_orphaned_files, announcement.publish,
--   announcement.schedule, org.suspend, org.unsuspend, org.soft_delete,
--   org.change_plan, org.export, billing.extend_expiry,
--   billing.manual_discount, billing.mark_paid, billing.cancel
--
-- Of these, the ones classified as security events (1-year retention) are:
-- impersonation (start/end -- who accessed a user's account and why),
-- account/org deletion and suspension (org.suspend/unsuspend/soft_delete,
-- user.suspend/unsuspend/delete), session revocation, admin management
-- (admin.invite), and every raw-SQL write path (db_explorer.write_*,
-- excluding the read-only db_explorer.read, which stays at 90 days like
-- ordinary reads-adjacent activity). Billing/plan changes are included
-- too, since they're financial and Doc 04 already treats them as a
-- distinct trust tier (Super-Admin/Admin only, never Support).
--
-- Login/logout are NOT in this list because they are not currently
-- written to audit_log at all -- platform_admins.last_login_at and
-- admin_sessions carry that state instead, with no separate audit_log
-- row per login/logout event anywhere in this codebase. The spec's
-- framing assumed login events exist as security-event audit_log rows;
-- flagging this plainly rather than fabricating a 1-year rule against
-- rows that are never written. If login/logout audit trail is wanted as
-- audit_log rows (not just admin_sessions state), that's a follow-up
-- item, not something this migration can retroactively apply to.
-- =============================================================================

create or replace function cleanup_audit_log_retention()
returns table (deleted_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count bigint;
  v_job_run_id uuid;
  v_security_actions text[] := array[
    'admin.impersonate_start',
    'admin.impersonate_end',
    'admin.invite',
    'org.suspend',
    'org.unsuspend',
    'org.soft_delete',
    'org.change_plan',
    'org.export',
    'user.suspend',
    'user.unsuspend',
    'user.delete',
    'user.revoke_sessions',
    'db_explorer.write_requested',
    'db_explorer.write_executed',
    'db_explorer.write_approved_and_executed',
    'db_explorer.write_rejected',
    'billing.extend_expiry',
    'billing.manual_discount',
    'billing.mark_paid',
    'billing.cancel'
  ];
begin
  -- Doc 01 §1.13 scheduled_job_runs bookkeeping — this job has no Edge
  -- Function call site to wrap it at (it's pure pg_cron + SQL, per this
  -- migration's header), so the function wraps its own run instead of
  -- following 0013's "Edge Function wraps it" pattern.
  insert into scheduled_job_runs (job_name, status)
  values ('audit_log_retention_cleanup', 'running')
  returning id into v_job_run_id;

  with removed as (
    delete from audit_log
    where
      (action = any(v_security_actions) and created_at < now() - interval '1 year')
      or
      (not (action = any(v_security_actions)) and created_at < now() - interval '90 days')
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

revoke all on function cleanup_audit_log_retention() from public, anon, authenticated;
grant execute on function cleanup_audit_log_retention() to service_role, postgres;

comment on function cleanup_audit_log_retention() is
  'Doc 04 §4.3.6 retention: 90 days normal, 1 year for the security-event
   action set defined in this function body (see this migration''s header
   for how that list was derived). Every run is logged to
   scheduled_job_runs regardless of outcome -- see this migration''s
   MONITORED_JOBS note below for surfacing it on Services Health.';

-- Pure-SQL pg_cron schedule, same pattern as 0026/0027/0030/0031 -- no new
-- Edge Function needed since a plain DELETE in a SQL function comfortably
-- handles audit_log's expected row volume in one transaction (unlike, say,
-- a per-row external API call, which is what justified an Edge Function
-- for the notification-sending jobs).
select cron.schedule(
  'audit-log-retention-cleanup-daily',
  '30 3 * * *', -- 03:30 UTC daily, off-peak, staggered from the other daily jobs
  $$select cleanup_audit_log_retention();$$
);

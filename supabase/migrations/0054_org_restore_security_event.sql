-- =============================================================================
-- 0054_org_restore_security_event.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.6
--
-- Admin remediation Tier 1.1 — soft-delete restore UI. `org.restore` is a
-- new logAdminAction() action string (apps/admin's organizations/[orgId]
-- route) that didn't exist when 0053 built cleanup_audit_log_retention()'s
-- v_security_actions list by grepping every call site that existed at the
-- time. Reversing a soft-delete (who un-deleted an org, and when) belongs
-- in the same 1-year-retention tier as org.soft_delete itself, for the
-- same reason org.suspend/unsuspend are both in that list rather than
-- just org.suspend — an account-status change is a security event in
-- either direction.
--
-- create or replace, not alter: this function has no separate "add one
-- action to the array" form — the whole body is replaced, matching how
-- 0053 itself would be revised if it needed another entry.
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
    'org.restore',
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
   action set defined in this function body. 0054 added org.restore to
   that set — see this migration''s header.';

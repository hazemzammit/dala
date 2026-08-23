-- =============================================================================
-- 0055_admin_reset_totp_security_event.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.6, §4.3.11
--
-- Admin remediation Tier 1.2 — locked-out admin TOTP re-provisioning.
-- `admin.reset_totp` (new logAdminAction() action string from
-- api/admin/admins/[adminId]/route.ts) belongs in the same 1-year-retention
-- tier as `admin.invite` — both are admin-account-management events, and
-- this one specifically is "who cleared another admin's 2FA enrollment,"
-- which is exactly the kind of action Doc 04 §4.3.6 means by a security
-- event. Own migration rather than folding into 0054 (org.restore) since
-- these are two independent Tier 1 items shipped/reviewed separately.
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
    'admin.reset_totp',
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
   action set defined in this function body. 0054 added org.restore, 0055
   added admin.reset_totp — see each migration''s header.';

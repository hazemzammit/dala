-- =============================================================================
-- 0026_admin_storage_rollup_and_cron.sql
-- (Originally drafted as 0025 — renumbered after a fresh copy of the repo
-- showed 0025 had already been taken by mobile's own Phase 5 migration,
-- 0025_phase5_trash_billing_tier0_digest.sql. No content collision, just a
-- numbering collision — same class of issue flagged for 0019/0020 at the
-- start of this admin phase, caught here before it caused a real problem.)
-- Ref: docs/spec/06-roadmap-ai-admin-testing-reference.md §6.3 (Platform Admin
-- dashboard — Storage Monitor, Services Health)
--
-- Two independent additions, both closing gaps the admin Phase 5 doc-check
-- found still open:
--
--   Part 1 — Storage Monitor has had no real data to read from. Doc 03 §3.7
--   describes an `organizations.storage_used_mb` running counter maintained
--   by an upload-confirm endpoint, but no migration ever added that column
--   or that endpoint — apps/mobile's actual storage.ts (first real Storage
--   code in this repo, added after 0020's `org-files` bucket) uploads
--   directly to Supabase Storage with an org-scoped path convention
--   (`{org_id}/{category}/{uuid}.{ext}`) and never calls back into Postgres
--   to increment anything. Rather than build Storage Monitor against a
--   counter that doesn't exist (or invent the missing endpoint, which is
--   its own decision this migration isn't making), this adds a read-only
--   RPC that computes real per-org usage directly from `storage.objects` —
--   more honest than a maintained counter that could drift, at the cost of
--   being an on-demand aggregate rather than an instant read.
--
--   Part 2 — send-impersonation-notifications (Edge Function, added last
--   session) was written but nothing ever scheduled it; queued
--   `impersonation_notifications` rows have been sitting unset. This wires
--   up pg_cron + pg_net to invoke it every 15 minutes, matching the
--   interval the function's own header comment already documented as the
--   intended cadence. This does NOT set up cron for expire_invitations /
--   send_payment_reminders / weekly_salary_summaries / cleanup_orphaned_
--   files — none of those have cron either, but that's a pre-existing gap
--   across the whole codebase predating this admin session, not something
--   introduced or silently expanded here. Flagged in the delivery guide,
--   not fixed here, since scheduling four unrelated jobs this admin
--   session doesn't own is its own piece of work.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1 — real per-org storage usage rollup
-- -----------------------------------------------------------------------------

-- Guards against a malformed/non-uuid first path segment ever reaching the
-- cast below (shouldn't happen given the upload convention every writer
-- follows, but a defensive read-only aggregate should not be able to throw
-- and take the whole Storage Monitor screen down over one bad row).
create or replace function admin_storage_usage_by_org()
returns table (organization_id uuid, file_count bigint, total_bytes bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  select
    (storage.foldername(o.name))[1]::uuid as organization_id,
    count(*)::bigint as file_count,
    coalesce(sum(((o.metadata ->> 'size'))::bigint), 0)::bigint as total_bytes
  from storage.objects o
  where o.bucket_id = 'org-files'
    and (storage.foldername(o.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  group by (storage.foldername(o.name))[1]::uuid;
$$;

revoke all on function admin_storage_usage_by_org() from public, anon, authenticated;
grant execute on function admin_storage_usage_by_org() to service_role;

comment on function admin_storage_usage_by_org() is
  'Doc 06 §6.3 Storage Monitor — real-time per-org rollup computed directly
   from storage.objects (bucket org-files, path convention {org_id}/{category}/
   {uuid}.{ext} per apps/mobile/src/lib/storage.ts). There is no
   organizations.storage_used_mb column in this schema; Doc 03 §3.7 describes
   one but no migration or endpoint ever implemented it. service_role only —
   called from apps/admin''s service-role route handler, never a client query.';

-- -----------------------------------------------------------------------------
-- Part 2 — schedule send-impersonation-notifications via pg_cron + pg_net
-- -----------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Secrets bootstrapped by scripts/register-cron-secrets.ts (same Vault
-- pattern as admin_get_totp_encryption_key() in 0023) rather than hardcoded
-- here — a migration file is checked into git, and a project URL is
-- environment-specific (local/staging/prod each point at a different
-- deployment) while the service-role key must never appear in source
-- control at all. Until that script has been run once per environment,
-- this scheduled job will run every 15 minutes and fail with a clear
-- "missing secret" error each time (logged to cron.job_run_details) rather
-- than silently doing nothing — same "no job fails silently" principle as
-- scheduled_job_runs (Doc 01 §1.13).
select cron.schedule(
  'send-impersonation-notifications',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'cron_edge_function_base_url'
    ) || '/send-impersonation-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cron_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

comment on extension pg_cron is
  'Doc 06 §6.3 / §4.3.3a step 6 — schedules send-impersonation-notifications.
   Only this one job is wired up here; expire_invitations,
   send_payment_reminders, weekly_salary_summaries, and cleanup_orphaned_files
   still have no cron trigger anywhere in this repo (a pre-existing gap, not
   introduced by this migration) — see the admin Phase 5 delivery guide.';

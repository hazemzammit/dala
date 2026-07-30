-- =============================================================================
-- 0026_phase6_digest_cron_wiring.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.13
--      docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.9a, §2.10
--      (Phase 6)
--
-- Closes the ONE concrete gap flagged in 0025/send-digest-notifications's
-- own header: the function's "run once now" logic shipped in Phase 5, but
-- nothing ever actually called it on a schedule. This migration is that
-- wiring — a real `cron.schedule()` call, not a comment describing one.
--
-- WHY THIS SHAPE (pg_cron + pg_net calling the Edge Function over HTTP,
-- rather than a Dashboard-configured "Edge Function Cron" entry): the
-- Dashboard cron UI is a manual, per-environment click-ops step that isn't
-- reviewable in a PR and doesn't exist in this repo at all — it would leave
-- staging/prod cron config invisible to anyone reading migrations. A SQL
-- migration keeps "the digest fires daily" as an auditable, re-deployable
-- fact of the schema, consistent with every other piece of scheduled-job
-- infrastructure in this repo living in supabase/migrations/, not a
-- dashboard setting. `supabase/config.toml`'s `[functions.*]` block has no
-- cron key in the CLI version this repo pins to (confirmed by reading the
-- current config.toml before writing this) — pg_cron is the only option
-- that's actually expressible as a migration.
--
-- SECRETS — I do not have and cannot fabricate this project's real
-- Supabase URL or service_role key. This migration reads them from
-- Supabase Vault at call time rather than hardcoding them, which means two
-- one-time manual steps are required after this migration runs (documented
-- again in the delivery notes):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- Until both secrets exist, the scheduled job will run, get a null URL/key,
-- and fail loudly into scheduled_job_runs (visible in Platform Admin's
-- Services Health, Doc 01 §1.13) rather than silently no-op — a missing
-- secret is a loud, diagnosable failure, not a quiet gap like the
-- unwired-cron state this migration fixes.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Local Supabase (`supabase start`) runs Postgres without network egress to
-- the internet, so this job would only ever fail loudly against a real
-- hosted project's URL — expected and fine; it's a staging/prod-only job.
select
  cron.schedule(
    'send-digest-notifications-daily',
    -- 05:00 UTC = 06:00 Tunis time (UTC+1, no DST since 2019, Doc 01 §1.7).
    -- Runs once daily; the function itself decides weekly vs. daily per
    -- profile (Monday = also-send-weekly) and per-org "nothing to say"
    -- suppression, so one daily cron trigger is sufficient — see
    -- send-digest-notifications/index.ts, unchanged by this migration.
    '0 5 * * *',
    $$
    select
      net.http_post(
        url := (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/send-digest-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb
      );
    $$
  );

comment on extension pg_cron is
  'Enables scheduled SQL jobs. First use in this repo (Doc 01 §1.13 documented the scheduled_job_runs bookkeeping pattern since Phase 0, but no actual cron trigger existed anywhere until this migration).';

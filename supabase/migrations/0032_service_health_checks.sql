-- =============================================================================
-- 0032_service_health_checks.sql
-- Ref: Doc 06 §6.3 — Services Health infra status grid. Flagged as an open
-- scope call across at least two prior sessions; built (partially,
-- disclosed below) this phase now that the queue-poll-Edge-Function +
-- pg_cron + shared-Vault-secrets pattern is proven three times over
-- (0026, 0027, 0030).
--
-- Deliberate scope cut, stated plainly: Konnect is NOT checked. Every
-- other service here (Supabase itself, Resend, Expo Push) already has
-- real, working integration code somewhere in this repo to base a
-- reachability check on. Konnect does not — Billing/payments is still an
-- explicitly deferred, unbuilt integration (see Billing route's own
-- comments), so there is no existing Konnect API call anywhere in this
-- codebase to confirm the right endpoint/auth shape against. Inventing
-- one for a health-check ping would risk pinging the wrong thing and
-- reporting a false "down" — worse than leaving it visibly unmonitored.
-- =============================================================================

create table service_health_checks (
  id            uuid primary key default gen_random_uuid(),
  service_name  text not null check (
    service_name in ('supabase_auth', 'supabase_storage', 'resend', 'expo_push')
  ),
  status        text not null check (status in ('up', 'down')),
  latency_ms    integer,
  error_message text,
  checked_at    timestamptz not null default now()
);

comment on table service_health_checks is
  'Doc 06 §6.3 Services Health infra grid. One row per reachability check per service per cron tick (ping-service-health, every 5 min). Konnect is deliberately absent — see migration header. "supabase_auth"/"supabase_storage" stand in for the broader Supabase API/Realtime status: if this Edge Function ran at all, Postgres and Edge Functions were up by definition, so a dedicated Postgres check would be tautological — Auth admin and Storage are the two Supabase sub-APIs admin actually depends on and that can independently fail.';

create index service_health_checks_service_checked_idx
  on service_health_checks (service_name, checked_at desc);

alter table service_health_checks enable row level security;
-- No client policies — written only by the service-role Edge Function,
-- read by apps/admin via its own service-role client (never direct
-- client-side Supabase calls, same rule as everywhere else in admin).

-- Retention: keep the table from growing unbounded — a health-check log
-- has no long-term audit value the way audit_log does. Delete anything
-- older than 7 days on the same cron tick that inserts new rows (done in
-- the Edge Function itself, not here, to keep this migration idempotent
-- and side-effect-free at apply time).

select cron.schedule(
  'ping-service-health',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'cron_edge_function_base_url'
    ) || '/ping-service-health',
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

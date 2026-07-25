-- =============================================================================
-- 0023_admin_security_hardening.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.11
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.1, §4.3.3a step 6
--
-- Closes three TODOs left open by 0021/0022:
--   1. platform_admins.totp_secret was plain text — Doc 01 §1.3.11's
--      pattern (AES-256-GCM, key in Supabase Vault) applies here, not just
--      to CIN. Note: as of this migration, CIN encryption itself hasn't
--      actually been implemented anywhere in this codebase yet either —
--      there is no `cin` column and no prior Vault usage to mirror. This
--      migration is the first real implementation of Doc 01 §1.3.11's
--      pattern in this repo, not a copy of existing CIN code.
--   2. platform_admins.allowed_ips (0009) was stored but never enforced —
--      only the platform-wide ADMIN_IP_ALLOWLIST env var was checked.
--   3. Doc 04 §4.3.3a step 6's owner-notification email had nowhere to
--      queue a 24h-delayed send.
-- =============================================================================

-- Supabase Vault isn't enabled by any prior migration in this repo.
create extension if not exists supabase_vault cascade;

-- ---------------------------------------------------------------------------
-- Part 1 — Vault-backed TOTP secret encryption
-- ---------------------------------------------------------------------------
-- The actual AES-256-GCM encrypt/decrypt happens in apps/admin's Node code
-- (Doc 01 §1.3.11 says "application layer," not "database layer") — this
-- function's only job is handing the raw key to that server-side code
-- without ever exposing it to anon/authenticated. The key itself is
-- inserted into vault.secrets by scripts/generate-totp-vault-key.ts (a
-- one-time bootstrap script, not this migration) — a real random key must
-- never be hardcoded into a migration file that gets committed to git.
create or replace function admin_get_totp_encryption_key(key_version text default 'v1')
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'admin_totp_encryption_key_' || key_version;
$$;

revoke all on function admin_get_totp_encryption_key(text) from public, anon, authenticated;
grant execute on function admin_get_totp_encryption_key(text) to service_role;

comment on function admin_get_totp_encryption_key(text) is
  'Doc 01 §1.3.11 — returns the raw AES-256-GCM key for platform_admins.totp_secret
   encryption from Supabase Vault. service_role only. The key itself is bootstrapped
   by scripts/generate-totp-vault-key.ts, not stored in any migration file.
   Versioned (key_version param) so a future key rotation can add a new version
   without invalidating already-encrypted secrets still tagged with the old one.';

comment on column platform_admins.totp_secret is
  'AES-256-GCM ciphertext, format "{keyVersion}.{ivBase64}.{authTagBase64}.{ciphertextBase64}"
   — see apps/admin/src/lib/crypto/totp-secret.ts. Never plain text as of this migration
   (0021 stored it plain — see that migration''s own now-outdated TODO comment).
   Never sent to any client — read only by server-side route handlers.';

-- ---------------------------------------------------------------------------
-- Part 2 — impersonation owner-notification queue (Doc 04 §4.3.3a step 6)
-- ---------------------------------------------------------------------------
-- A durable queue rather than a synchronous send from the /impersonate/end
-- route handler, because the "Urgent" case needs a genuine 24h delay — a
-- Route Handler can't sleep for a day. A scheduled job (Edge Function, see
-- supabase/functions/send-impersonation-notifications) picks up due rows
-- on a cron, matching the scheduled_job_runs pattern already established
-- in 0010 for send_payment_reminders/weekly_salary_summaries/etc.
create table impersonation_notifications (
  id               uuid primary key default gen_random_uuid(),
  admin_id         uuid not null references platform_admins(id),
  org_id           uuid not null references organizations(id),
  impersonated_user_id uuid not null references profiles(id),
  reason           text not null,
  session_ended_at timestamptz not null default now(),
  send_after       timestamptz not null, -- now() normally; now()+24h if "Urgent" was checked
  sent_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index impersonation_notifications_pending_idx on impersonation_notifications (send_after)
  where sent_at is null;

alter table impersonation_notifications enable row level security;
-- No client policies: written by apps/admin's /impersonate/end route
-- (service-role), read/updated only by the scheduled Edge Function.

comment on table impersonation_notifications is
  'Doc 04 §4.3.3a step 6 — queued org-owner notification emails for ended
   impersonation sessions. send_after enforces the 24h delay when the admin
   checked "Urgent" at impersonation start; otherwise send_after = session end time.';

-- ---------------------------------------------------------------------------
-- Part 3 — impersonation needs org context to know which org's owner to
-- notify (a user can belong to multiple orgs; §4.3.3a's "the org owner"
-- only makes sense once impersonation is scoped to a specific org, which
-- 0021's admin_sessions didn't capture).
-- ---------------------------------------------------------------------------
alter table admin_sessions add column impersonation_org_id uuid references organizations(id);

comment on column admin_sessions.impersonation_org_id is
  'Which org''s owner to notify on impersonation end (Doc 04 §4.3.3a step 6).
   Set at impersonation start alongside impersonating_user_id (0021).';

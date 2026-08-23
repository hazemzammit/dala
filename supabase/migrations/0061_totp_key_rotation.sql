-- =============================================================================
-- 0061_totp_key_rotation.sql
-- Ref: docs/spec/00-foundations-vision-and-decisions.md §0.5 item 8 (CIN's
--      rotation design — the pattern this borrows, not copies: see below)
-- Ref: migration 0023 (admin_get_totp_encryption_key, versioned ciphertext
--      format, "rotatable... without a data migration" design)
--
-- Admin remediation Tier 2.7 — makes the rotation 0023 designed for
-- actually happen on a schedule, rather than staying permanently manual.
--
-- CORRECTED PLAN CITATION: the plan pointed to "Doc 02 §2.7" for the CIN
-- key_rotation_log table to mirror. Doc 02 §2.7 is "Client-facing
-- features" — unrelated. The real CIN rotation design is Doc 00 §0.5 item
-- 8 ("rotated every 90 days with a background re-encryption job"). More
-- to the point: CHECKED FIRST, per the plan's own instruction — no
-- `key_rotation_log` table, or any CIN encryption code at all, exists
-- anywhere in this repo. 0023's own header already disclosed this ("as of
-- this migration, CIN encryption itself hasn't actually been implemented
-- anywhere in this codebase yet either"), and nothing since has changed
-- that. There is nothing to mirror — `totp_key_rotation_log` below is a
-- new design, not a copy.
--
-- CADENCE: Doc 00 §0.5 doesn't specify one for this key (only for CIN's,
-- 90 days) — a deliberate choice, not an inherited default. Going with
-- 180 days: this key protects platform_admins.totp_secret, an internal,
-- small-blast-radius secret (a handful of admin accounts) compared to
-- CIN, which touches every contractor's national ID. Rotating twice a
-- year is a reasonable cadence for that lower-stakes internal secret.
--
-- REAL ARCHITECTURAL ISSUE FOUND WHILE DESIGNING THIS (not hypothetical):
-- apps/admin/src/lib/crypto/totp-secret-core.ts hardcodes
-- `const CURRENT_KEY_VERSION = 'v1'` as a TypeScript module constant.
-- encryptTotpSecretWithPool() always tags NEW ciphertext with whatever
-- that constant says — decrypt is version-aware (reads the version from
-- each stored ciphertext's own prefix), but encrypt is not. A rotation
-- job that only rotates key MATERIAL in Vault and re-encrypts existing
-- rows, without also flipping which version NEW encryptions use, would
-- "rotate" in name only: every admin.reset_totp (Tier 1.2) or first-login
-- TOTP setup after rotation would keep silently encrypting with the OLD
-- key version forever, since nothing tells the Node code the current
-- version changed. A fully automated rotation cannot depend on a
-- synchronized code deploy landing at the same moment as a cron tick —
-- so "current version for new writes" needs to be a DB value the
-- rotation job can flip, not a hardcoded constant. Part 1 below is that
-- fix; totp-secret-core.ts is updated in the same delivery to read it
-- instead of the hardcoded constant (see that file's own updated header).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — current-version state (the fix for the issue above)
-- ---------------------------------------------------------------------------
-- Singleton config table (Postgres "one-row settings table" pattern —
-- `id boolean primary key default true check (id)` makes a second row
-- physically impossible, not just discouraged by convention).
create table totp_encryption_key_state (
  id              boolean primary key default true check (id),
  current_version text not null default 'v1',
  updated_at      timestamptz not null default now()
);

insert into totp_encryption_key_state (current_version) values ('v1');

create or replace function admin_get_current_totp_key_version()
returns text
language sql
security definer
set search_path = public
as $$
  select current_version from totp_encryption_key_state where id = true;
$$;

revoke all on function admin_get_current_totp_key_version() from public, anon, authenticated;
grant execute on function admin_get_current_totp_key_version() to service_role;

create or replace function admin_set_current_totp_key_version(p_new_version text)
returns void
language sql
security definer
set search_path = public
as $$
  update totp_encryption_key_state set current_version = p_new_version, updated_at = now()
  where id = true;
$$;

revoke all on function admin_set_current_totp_key_version(text) from public, anon, authenticated;
grant execute on function admin_set_current_totp_key_version(text) to service_role;

comment on table totp_encryption_key_state is
  'Single-row config: which Vault key version (see admin_get_totp_encryption_key,
   0023) NEW platform_admins.totp_secret encryptions should use. Existing
   ciphertext is unaffected by this value — decrypt reads the version from
   each row''s own stored prefix. Flipped only by rotate-totp-encryption-key
   (0061) AFTER every existing admin has been successfully re-encrypted
   under the new version, never before — see that function''s own ordering
   for why (an admin must never be locked out mid-rotation).';

-- ---------------------------------------------------------------------------
-- Part 2 — Vault write access for the rotation Edge Function
-- ---------------------------------------------------------------------------
-- admin_get_totp_encryption_key() (0023) already covers READING a key by
-- version — reused as-is by the rotation function for both the old key
-- (to decrypt existing secrets) and the newly-created key (to re-encrypt
-- them). This is the missing WRITE half: creating a new versioned secret
-- in Vault. Kept as its own narrow function (not a generic "write
-- anything to vault.secrets" RPC) so its grant to service_role can't be
-- repurposed for anything beyond this one naming pattern.
create or replace function admin_create_totp_encryption_key_vault_secret(
  p_new_version text,
  p_key_base64 text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.create_secret(p_key_base64, 'admin_totp_encryption_key_' || p_new_version);
end;
$$;

revoke all on function admin_create_totp_encryption_key_vault_secret(text, text)
  from public, anon, authenticated;
grant execute on function admin_create_totp_encryption_key_vault_secret(text, text)
  to service_role;

comment on function admin_create_totp_encryption_key_vault_secret(text, text) is
  'Doc 01 §1.3.11 rotation — the write-side counterpart to
   admin_get_totp_encryption_key() (0023, read-only). Called once per
   rotation run by rotate-totp-encryption-key to create the new versioned
   Vault entry before re-encrypting any platform_admins row.';

-- ---------------------------------------------------------------------------
-- Part 3 — rotation run log
-- ---------------------------------------------------------------------------
create table totp_key_rotation_log (
  id                        uuid primary key default gen_random_uuid(),
  old_key_version           text not null,
  new_key_version           text not null,
  status                    text not null check (status in ('running', 'success', 'failed')),
  admins_total              integer,
  admins_reencrypted        integer,
  error_message             text,
  started_at                timestamptz not null default now(),
  completed_at              timestamptz
);

alter table totp_key_rotation_log enable row level security;
revoke all on totp_key_rotation_log from public, anon, authenticated;
grant select, insert, update on totp_key_rotation_log to service_role;

comment on table totp_key_rotation_log is
  'Doc 00 §0.5 item 8''s rotation-log pattern, applied to the TOTP
   encryption key (no existing CIN key_rotation_log table to mirror — see
   this migration''s header). One row per rotate-totp-encryption-key run.
   admins_reencrypted reaching admins_total is the condition
   admin_set_current_totp_key_version() is gated on inside that function
   — a partial run (some admins re-encrypted, then a crash) leaves
   status=''failed'' and current_version unchanged, so no admin is ever
   locked out by an incomplete rotation.';

-- ---------------------------------------------------------------------------
-- Part 4 — schedule via pg_cron + pg_net, same pattern as 0026/0027/0030
-- ---------------------------------------------------------------------------
-- 180-day cadence (see header) expressed as a monthly cron check rather
-- than a literal "every 180 days" (cron syntax has no such unit): runs on
-- the 1st of every 6th month at 04:00 UTC. Simpler and more auditable
-- than computing an exact 180-day interval, and the Edge Function itself
-- is the real gate — see rotate-totp-encryption-key's own header for how
-- it no-ops safely if invoked more often than intended.
select cron.schedule(
  'rotate-totp-encryption-key',
  '0 4 1 1,7 *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'cron_edge_function_base_url'
    ) || '/rotate-totp-encryption-key',
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

-- =============================================================================
-- 0094_lock_rib_key_and_unprotected_tables.sql
--
-- CRITICAL FIX (audit findings P0-B and P1-C).
--
-- 1. organization_get_rib_encryption_key() is SECURITY DEFINER, reads
--    vault.decrypted_secrets and performs NO caller check. It was EXECUTE-able
--    by anon and by every authenticated user, and organizations.rib_encrypted
--    (the ciphertext) was column-readable by any org member incl. viewers —
--    so any org's RIB could be decrypted client-side. Its ONLY legitimate
--    caller is update_organization_rib(), itself SECURITY DEFINER (runs as the
--    function owner, which keeps EXECUTE), so revoking client access breaks
--    nothing. service_role keeps EXECUTE for future server-side use.
--
-- 2. authenticated no longer has SELECT on organizations.rib_encrypted.
--    Postgres cannot revoke a single column from a table-level grant, so the
--    table-level SELECT is revoked and re-granted per column, minus the
--    ciphertext. CONSEQUENCE: `select('*')` on organizations now fails for
--    end-user sessions (permission denied) — callers must list columns. The
--    one such caller (apps/mobile billing.tsx) is fixed in the same change.
--    Any column added to organizations LATER needs an explicit
--    `grant select (col) on organizations to authenticated`.
--
-- 3. edge_function_rate_limits and totp_encryption_key_state had RLS disabled
--    and full table grants to authenticated (any user could wipe the rate
--    limiter or overwrite the TOTP key version). Every legitimate accessor is
--    a SECURITY DEFINER function executable by service_role only, so: enable
--    RLS (deny-all, no policies — owner/service_role still bypass) and revoke
--    all client access.
--
-- OPERATIONAL FOLLOW-UP (cannot be done in a migration): the RIB key was
-- retrievable without authentication before this migration — treat it as
-- compromised. Rotation runbook: (a) create vault secret
-- 'organization_rib_encryption_key_v2'; (b) with service_role/postgres,
-- re-encrypt: update organizations set rib_encrypted =
-- pgp_sym_encrypt(pgp_sym_decrypt(rib_encrypted, <v1 key>), <v2 key>)
-- where rib_encrypted is not null; (c) point update_organization_rib at v2;
-- (d) delete the v1 secret. Also consider RIB values themselves exposed to
-- anyone who read ciphertext + key before this fix.
-- =============================================================================

-- 1. RIB key function ---------------------------------------------------------
revoke execute on function public.organization_get_rib_encryption_key(text)
  from public, anon, authenticated;
grant execute on function public.organization_get_rib_encryption_key(text)
  to service_role;

-- 2. Ciphertext column --------------------------------------------------------
revoke select on public.organizations from anon, authenticated;

do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'organizations'
    and column_name <> 'rib_encrypted';

  execute format('grant select (%s) on public.organizations to authenticated', v_cols);
end $$;

-- 3. Tables that never had RLS ------------------------------------------------
alter table public.edge_function_rate_limits enable row level security;
alter table public.totp_encryption_key_state enable row level security;

revoke all on public.edge_function_rate_limits from anon, authenticated;
revoke all on public.totp_encryption_key_state from anon, authenticated;

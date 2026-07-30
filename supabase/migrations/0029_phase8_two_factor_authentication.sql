-- =============================================================================
-- 0029_phase8_two_factor_authentication.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.15
--
-- Phase 8 — builds optional per-account 2FA using SUPABASE AUTH'S OWN NATIVE
-- TOTP MFA (auth.mfa.enroll/challenge/verify, auth.mfa_factors/
-- auth.mfa_challenges — GoTrue-managed, no migration needed to create those),
-- not a custom totp_secret column. This was a deliberate choice over
-- mirroring Platform Admin's existing approach (platform_admins.totp_secret,
-- migrations 0009/0021/0023) — that column is plain-text (0021's own
-- comment admits this needs Vault hardening) and, more importantly, a
-- custom post-login TOTP check can't make Supabase issue anything other
-- than a fully-valid aal1 session at sign-in — the verification becomes a
-- client-side gate a modified client could skip. Native MFA's session
-- carries a real `aal` (authenticator assurance level) claim GoTrue itself
-- controls, so RLS/`auth.jwt() ->> 'aal'` checks are enforcing something the
-- server actually knows, not something the mobile app is trusted to have
-- checked. Platform Admin's TOTP is left as-is (a separate, legacy
-- mechanism) — migrating it to native MFA too is a bigger, cross-cutting
-- change out of scope for a mobile-only phase.
--
-- The one thing native MFA doesn't provide out of the box is recovery
-- codes for a lost authenticator — this migration adds exactly that, and
-- nothing else. Enrollment/challenge/verify/unenroll all happen client-side
-- via supabase-js's own `auth.mfa.*` calls; there is no SQL for those steps
-- because there's nothing for this schema to own.
-- =============================================================================

create table mfa_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null, -- bcrypt via pgcrypto, same as phone_change_requests (0028)
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table mfa_recovery_codes is
  'Doc 01 §1.15 — single-use recovery codes for a lost TOTP authenticator. Generated once at enrollment (10 codes) and regenerable afterward (regenerating invalidates the prior set). Never client-readable — see the RPCs below, the only way in or out.';

create index mfa_recovery_codes_user_id_idx on mfa_recovery_codes (user_id);

alter table mfa_recovery_codes enable row level security;

-- No client-side select/insert/update/delete policies — same reasoning as
-- phone_change_requests (0028) and platform_admins (0009): a code hash
-- should never be client-readable, written and read only by the
-- SECURITY DEFINER RPCs below and the mfa-recover Edge Function
-- (service-role, bypasses RLS entirely by design).

create or replace function generate_mfa_recovery_codes()
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_aal text;
  v_codes text[] := array[]::text[];
  v_code text;
  i int;
begin
  -- Only callable once this session has actually completed a TOTP
  -- challenge (aal2) — either right after enrollment verification (which
  -- elevates the session itself) or any later session where the user
  -- re-verified at login. A session that never verified a factor (aal1,
  -- e.g. 2FA not yet enrolled) can't call this — there would be nothing
  -- to protect the codes with.
  v_aal := auth.jwt() ->> 'aal';
  if v_aal is distinct from 'aal2' then
    raise exception 'Vérification à deux facteurs requise.' using errcode = '42501';
  end if;

  delete from mfa_recovery_codes where user_id = auth.uid();

  for i in 1..10 loop
    -- 8 uppercase-alphanumeric characters, ambiguous chars (0/O, 1/I/L)
    -- excluded since these are hand-typed during an actual lost-device
    -- recovery, not copy-pasted.
    v_code := '';
    for _ in 1..8 loop
      v_code := v_code || substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_codes := array_append(v_codes, v_code);
    insert into mfa_recovery_codes (user_id, code_hash) values (auth.uid(), crypt(v_code, gen_salt('bf')));
  end loop;

  return v_codes;
end;
$$;

comment on function generate_mfa_recovery_codes() is
  'Doc 01 §1.15 — returns 10 plaintext codes ONCE (never retrievable again after this call returns); replaces any prior set. Requires the caller''s current session to already be aal2 (i.e., this call itself only makes sense right after enrollment verification or a later re-verified login).';

grant execute on function generate_mfa_recovery_codes() to authenticated;

create or replace function count_unused_mfa_recovery_codes()
returns int language sql security definer set search_path = public as $$
  select count(*)::int from mfa_recovery_codes where user_id = auth.uid() and used_at is null;
$$;

comment on function count_unused_mfa_recovery_codes() is
  'Doc 01 §1.15 — lets Security settings show "N codes remaining" without ever exposing a code value.';

grant execute on function count_unused_mfa_recovery_codes() to authenticated;

-- Service-role only (called from the mfa-recover Edge Function, which
-- authenticates the user by password first and so already knows their
-- user_id — this isn't reachable via a normal authenticated JWT since it
-- takes an explicit p_user_id rather than using auth.uid()).
create or replace function verify_and_consume_recovery_code(p_user_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_row mfa_recovery_codes%rowtype;
begin
  select * into v_row from mfa_recovery_codes
    where user_id = p_user_id and used_at is null and code_hash = crypt(p_code, code_hash)
    limit 1;

  if not found then
    return false;
  end if;

  update mfa_recovery_codes set used_at = now() where id = v_row.id;
  return true;
end;
$$;

comment on function verify_and_consume_recovery_code(uuid, text) is
  'Service-role only — see mfa-recover Edge Function. Single-use: the matched code is marked used_at immediately, so a leaked/reused code fails on a second attempt.';

revoke execute on function verify_and_consume_recovery_code(uuid, text) from authenticated, anon;
grant execute on function verify_and_consume_recovery_code(uuid, text) to service_role;

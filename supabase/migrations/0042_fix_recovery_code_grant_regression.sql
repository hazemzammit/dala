-- =============================================================================
-- 0042_fix_recovery_code_grant_regression.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- Fixes a regression introduced by 0041_harden_rpc_grants_authenticated_only.sql.
--
-- 0029 (Phase 8) deliberately locked verify_and_consume_recovery_code(uuid, text)
-- to service_role only:
--
--   revoke execute on function verify_and_consume_recovery_code(uuid, text)
--     from authenticated, anon;
--   grant execute on function verify_and_consume_recovery_code(uuid, text)
--     to service_role;
--
-- ...with an explicit comment explaining why: the function takes an explicit
-- p_user_id with NO auth.uid() check inside it at all. It is only safe to call
-- because the mfa-recover Edge Function verifies the caller's password first,
-- then calls this function using the service-role key -- a role Postgres
-- trusts unconditionally, bypassing RLS and any notion of "caller identity."
--
-- 0041's blanket sweep ("every function still carrying Postgres's default
-- PUBLIC grant gets revoke-from-public + grant-to-authenticated") caught this
-- function along with the other ~34, because by that point in the operation
-- it still showed a stale PUBLIC grant from creation -- but it should never
-- have received an `authenticated` grant, only had PUBLIC revoked. It was the
-- only one of the six functions ever explicitly locked to service_role-only
-- (the other five -- find_user_id_by_email, admin_get_totp_encryption_key,
-- admin_storage_usage_by_org, resolve_announcement_recipients,
-- publish_due_scheduled_announcements -- were correctly left alone) that got
-- swept in by mistake.
--
-- Live-confirmed impact before this fix (Phase 16 live-verification re-run):
-- `has_function_privilege('authenticated', ..., 'execute')` returned true for
-- this function. Concretely: any logged-in user could call
-- verify_and_consume_recovery_code(<any other user's id>, <guessed code>)
-- directly over PostgREST, with no password check at all -- if they landed a
-- valid, unused recovery code belonging to someone else's account, that call
-- disables the OTHER user's 2FA. This migration closes that back up: it
-- restores the exact grant state 0029 originally established.
-- =============================================================================

revoke execute on function verify_and_consume_recovery_code(uuid, text) from authenticated;
revoke execute on function verify_and_consume_recovery_code(uuid, text) from anon;
grant execute on function verify_and_consume_recovery_code(uuid, text) to service_role;

comment on function verify_and_consume_recovery_code(uuid, text) is
  'Service-role only -- see mfa-recover Edge Function. Single-use: the matched '
  'code is marked used_at immediately, so a leaked/reused code fails on a '
  'second attempt. Re-locked to service_role in 0042 after 0041 accidentally '
  'granted it to authenticated -- see this migration''s header for the '
  'live-confirmed impact of that regression.';

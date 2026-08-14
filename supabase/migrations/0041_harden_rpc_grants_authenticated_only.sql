-- =============================================================================
-- 0041_harden_rpc_grants_authenticated_only.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- Found via a live query (Phase 16) run against a real local instance for
-- the first time: `select p.proname, has_function_privilege('anon', ...)`
-- across every function in `public` showed the overwhelming majority of
-- this app's RPC surface — roughly 34 functions — returning `true` for
-- anon, despite most of them being money-moving, membership-mutating, or
-- account-level actions with no legitimate reason to be callable before a
-- real session exists. Postgres grants EXECUTE to PUBLIC by default on any
-- new function unless explicitly revoked, and that revoke was never done
-- across this codebase's history — including on several functions (e.g.
-- `create_organization_for_current_user`, 0014) that already carried an
-- explicit `grant ... to authenticated` alongside the un-revoked default,
-- proving the intent was always authenticated-only; the PUBLIC grant was
-- simply never cleaned up alongside it.
--
-- This is a distinct, lower-severity finding from 0040's fail-open
-- permission-check bug in the same session: most of these functions DO
-- correctly gate on `auth.uid()`/`org_role_of()` internally (and with
-- 0040 applied, that gating now actually works), so a genuinely anonymous
-- caller with no JWT would still be rejected internally today. This
-- migration is about not relying on that as the only line of defense —
-- matching this repo's own stated convention that every function's
-- intended caller be stated and enforced explicitly, not left at whatever
-- Postgres defaults to.
--
-- Scope, deliberately: every function below gets an explicit
-- `revoke ... from public` + `grant ... to authenticated`. Nothing here
-- changes function bodies, return types, or any authenticated-role
-- behavior — `authenticated` already has (or now explicitly gets) the
-- exact same access it always had. Explicitly NOT touched, checked and
-- confirmed correct as-is during this same investigation:
--   - `get_organization_member_invitation_by_token`,
--     `get_project_invitation_by_token`, `get_worker_invitation_by_token`,
--     `app_version_check`, `health_check` — deliberately anon-safe by
--     design (each has its own "Anon-safe, token-scoped" comment from the
--     phase that introduced it), used before any session exists.
--   - `is_org_member`, `org_role_of`, `is_project_member`,
--     `is_own_worker`, `is_org_participant`, `is_project_active`,
--     `is_project_participant` — intentionally granted to both `anon` and
--     `authenticated` in 0039, so an RLS policy evaluated in an anon
--     context still gets a quiet `false`/empty-role result rather than a
--     hard permission-denied error.
--   - pg_trgm extension functions (`gin_trgm_*`, `gtrgm_*`,
--     `*similarity*`, `show_limit`, `set_limit`, `show_trgm`) — not
--     application code, PUBLIC execute on these is normal, expected
--     Postgres extension behavior.
--   - Trigger-only functions (`handle_new_auth_user`, `set_updated_at`,
--     `set_project_worker_org_id`) — never called directly as RPCs in
--     practice; left alone rather than risking an unnecessary change to
--     something outside today's investigation.
-- =============================================================================

revoke execute on function accept_organization_member_invitation(text) from public;
revoke execute on function accept_project_invitation(text, boolean) from public;
revoke execute on function create_organization_for_current_user(text, text) from public;
revoke execute on function approve_advance(uuid, uuid) from public;
revoke execute on function confirm_phone_change(text) from public;
revoke execute on function count_unused_mfa_recovery_codes() from public;
revoke execute on function create_advance(uuid, uuid, numeric, text, uuid) from public;
revoke execute on function disable_client_portal_pin(uuid) from public;
revoke execute on function generate_client_portal_link(uuid) from public;
revoke execute on function generate_mfa_recovery_codes() from public;
revoke execute on function get_active_in_app_announcements() from public;
revoke execute on function get_digest_summary(uuid) from public;
revoke execute on function get_worker_lateness_pattern(uuid) from public;
revoke execute on function invite_org_to_project(uuid, text, text, text, text) from public;
revoke execute on function invite_organization_member(uuid, text, text) from public;
revoke execute on function invite_worker(uuid, text, text, text, text, numeric, text) from public;
revoke execute on function mark_latest_password_reset_completed() from public;
revoke execute on function mark_salary_cycle_paid(uuid, uuid) from public;
revoke execute on function purge_soft_deleted_records() from public;
revoke execute on function remove_organization_member(uuid, uuid) from public;
revoke execute on function request_account_deletion() from public;
revoke execute on function request_advance(numeric, text, uuid) from public;
revoke execute on function request_phone_change(text) from public;
revoke execute on function restore_organization(uuid) from public;
revoke execute on function restore_project(uuid) from public;
revoke execute on function restore_worker(uuid) from public;
revoke execute on function search_all(text, uuid) from public;
revoke execute on function set_client_portal_pin(uuid, text) from public;
revoke execute on function soft_delete_organization(uuid) from public;
revoke execute on function soft_delete_project(uuid) from public;
revoke execute on function soft_delete_worker(uuid) from public;
revoke execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid) from public;
revoke execute on function update_organization_member_role(uuid, uuid, text) from public;
revoke execute on function update_organization_profile(uuid, text, text, text, text, text, text, text, text) from public;
revoke execute on function verify_and_consume_recovery_code(uuid, text) from public;

grant execute on function accept_organization_member_invitation(text) to authenticated;
grant execute on function accept_project_invitation(text, boolean) to authenticated;
grant execute on function create_organization_for_current_user(text, text) to authenticated;
grant execute on function approve_advance(uuid, uuid) to authenticated;
grant execute on function confirm_phone_change(text) to authenticated;
grant execute on function count_unused_mfa_recovery_codes() to authenticated;
grant execute on function create_advance(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function disable_client_portal_pin(uuid) to authenticated;
grant execute on function generate_client_portal_link(uuid) to authenticated;
grant execute on function generate_mfa_recovery_codes() to authenticated;
grant execute on function get_active_in_app_announcements() to authenticated;
grant execute on function get_digest_summary(uuid) to authenticated;
grant execute on function get_worker_lateness_pattern(uuid) to authenticated;
grant execute on function invite_org_to_project(uuid, text, text, text, text) to authenticated;
grant execute on function invite_organization_member(uuid, text, text) to authenticated;
grant execute on function invite_worker(uuid, text, text, text, text, numeric, text) to authenticated;
grant execute on function mark_latest_password_reset_completed() to authenticated;
grant execute on function mark_salary_cycle_paid(uuid, uuid) to authenticated;
grant execute on function purge_soft_deleted_records() to authenticated;
grant execute on function remove_organization_member(uuid, uuid) to authenticated;
grant execute on function request_account_deletion() to authenticated;
grant execute on function request_advance(numeric, text, uuid) to authenticated;
grant execute on function request_phone_change(text) to authenticated;
grant execute on function restore_organization(uuid) to authenticated;
grant execute on function restore_project(uuid) to authenticated;
grant execute on function restore_worker(uuid) to authenticated;
grant execute on function search_all(text, uuid) to authenticated;
grant execute on function set_client_portal_pin(uuid, text) to authenticated;
grant execute on function soft_delete_organization(uuid) to authenticated;
grant execute on function soft_delete_project(uuid) to authenticated;
grant execute on function soft_delete_worker(uuid) to authenticated;
grant execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid) to authenticated;
grant execute on function update_organization_member_role(uuid, uuid, text) to authenticated;
grant execute on function update_organization_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function verify_and_consume_recovery_code(uuid, text) to authenticated;

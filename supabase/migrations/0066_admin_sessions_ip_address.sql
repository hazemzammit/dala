-- =============================================================================
-- 0066_admin_sessions_ip_address.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.11
--
-- Admin remediation Tier 4.9 — admin session visibility/management.
-- Checked first, per the plan's own instruction: admin_sessions (0021)
-- has no IP column today — created_at/last_active_at/expires_at/
-- revoked_at and the impersonation-state columns, nothing else. Adding
-- one here so the new sessions screen can show it; captured at session
-- creation (login/step2/route.ts) using getClientIp(), the exact same
-- shared helper login/step1/route.ts and middleware.ts already use for
-- the allowed_ips/ADMIN_IP_ALLOWLIST checks, so this doesn't introduce a
-- second way of reading the client IP that could quietly disagree with
-- those two.
-- =============================================================================

alter table admin_sessions add column ip_address text;

comment on column admin_sessions.ip_address is
  'Captured once at session creation (login/step2/route.ts), via the same
   getClientIp() helper middleware.ts and login/step1 already use. Null
   for any session created before this migration.';

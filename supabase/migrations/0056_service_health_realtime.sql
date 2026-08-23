-- =============================================================================
-- 0056_service_health_realtime.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.9
--
-- Admin remediation Tier 1.3 — Services Health grid is missing Realtime.
-- 0032's header explains why supabase_auth/supabase_storage were treated
-- as standing in for the broader Supabase API surface ("if this Edge
-- Function ran at all, Postgres and Edge Functions were up by definition,
-- so a dedicated Postgres check would be tautological") — but Realtime is
-- a genuinely independent Supabase sub-service that can fail on its own
-- (websocket layer, not the REST/Auth API path the Auth/Storage checks
-- already exercise), so a dedicated check adds real signal rather than
-- being redundant with the existing two. Doc 04 §4.3.9's own layout spec
-- explicitly lists "Supabase API/Auth/Storage/Realtime" as separate grid
-- cells, confirming this isn't meant to be folded into an existing check.
--
-- Note this migration number shifted from the remediation plan's stated
-- 0055 to 0056 — Tier 1.2 (admin.reset_totp) needed its own retention-list
-- migration (0055) that the original plan hadn't accounted for.
-- =============================================================================

alter table service_health_checks
  drop constraint service_health_checks_service_name_check,
  add constraint service_health_checks_service_name_check
    check (service_name in
      ('supabase_auth', 'supabase_storage', 'supabase_realtime', 'resend', 'expo_push'));

comment on constraint service_health_checks_service_name_check on service_health_checks is
  '0056 added supabase_realtime — see this migration''s header for why it
   is a genuinely separate check rather than redundant with
   supabase_auth/supabase_storage (0032''s original tautology argument
   doesn''t apply to Realtime''s websocket layer).';

-- =============================================================================
-- 0102_views_security_invoker.sql
--
-- CROSS-TENANT LEAK found while scoping the viewer/payroll work.
--
-- `active_vehicles` (0076) was created without `security_invoker = true`. A
-- Postgres view runs with its OWNER's rights, and the owner (postgres) bypasses
-- row level security — so the view returned EVERY organisation's vehicles
-- (name, licence plate, capacity, status, photo path) to any signed-in user,
-- and, with the default anon table grants, to anonymous callers too. Reproduced
-- live: an outsider with zero memberships saw `vehicles` = 0 rows but
-- `active_vehicles` = every org's rows.
--
-- The other three views (active_projects, active_workers, attendance_effective)
-- already had security_invoker = true. This migration:
--   1. sets it on active_vehicles, so the view enforces the caller's RLS exactly
--      like the base table;
--   2. removes anonymous SELECT on all four views (none is used pre-login);
--   3. is guarded by supabase/tests/lint_views_security_invoker.sql in CI, so a
--      future view cannot silently bypass RLS again.
-- =============================================================================

alter view public.active_vehicles set (security_invoker = true);

revoke select on public.active_vehicles      from anon;
revoke select on public.active_projects      from anon;
revoke select on public.active_workers       from anon;
revoke select on public.attendance_effective from anon;

-- 0092 — grant service_role EXECUTE on the two org lifecycle RPCs.
--
-- Migration 0041 hardened RPC grants to `authenticated`-only and revoked the
-- PUBLIC default, but never re-granted `service_role`. The admin app's own
-- mutation route (apps/admin/src/app/api/admin/organizations/[orgId]/route.ts,
-- POST case 'soft_delete'/'restore') calls these two functions through the
-- service-role client — and every non-GET admin route is already gated to
-- super_admin via requireRole() before the RPC runs, so this is not a
-- privilege widening of anything user-reachable. Same remediation pattern as
-- 0042's fix for 0041's first over-revocation.
grant execute on function public.soft_delete_organization(uuid) to service_role;
grant execute on function public.restore_organization(uuid) to service_role;

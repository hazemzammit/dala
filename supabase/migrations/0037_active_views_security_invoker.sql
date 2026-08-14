-- =============================================================================
-- 0037_active_views_security_invoker.sql
--
-- Closes disclosed gap (b) from Phase 13 (see 0036's header): `active_projects`
-- (0013) and `active_workers` (0025) were created before `security_invoker`
-- was in active use in this codebase (introduced 0036) and never set it.
--
-- Live-verification query (run this phase, per the brief):
--   select v.viewname, v.viewowner, r.rolbypassrls
--   from pg_views v join pg_roles r on r.rolname = v.viewowner
--   where v.schemaname = 'public'
--     and v.viewname in ('active_projects', 'active_workers', 'attendance_effective');
-- Without `security_invoker = true`, a view's underlying-table RLS checks run
-- as the VIEW OWNER (typically the migration-applying role, which usually has
-- BYPASSRLS), not the querying user. If that's true in this project's actual
-- hosted/local configuration, both views were leaking every org's projects/
-- workers to any authenticated caller who queried them directly, regardless
-- of `is_org_member()`. This migration does not itself confirm that role's
-- `rolbypassrls` value — that still needs the live query above run for real
-- — but it fixes the exposure either way: `security_invoker = true` makes the
-- view's permission and RLS checks run as the querying user unconditionally,
-- which is correct regardless of what the view-owner role turns out to be.
--
-- No new GRANT needed: both views already receive `select` on `authenticated`
-- and `service_role` from 0016_default_grants.sql's blanket
-- `grant ... on all tables in schema public` (this includes views in
-- Postgres) plus its `alter default privileges` for anything created after
-- — `active_projects` (0013) predates 0016 so was covered by the initial
-- blanket grant when 0016 ran; `active_workers` (0025) postdates 0016 so
-- inherited the default-privileges grant automatically. Only the view
-- definition itself is changing here.
--
-- Call-site audit performed before writing this migration (not assumed):
-- every mobile screen/function querying either view was checked for its own
-- defensive `.eq('org_id', ...)` filter, since — per the brief — that
-- filter is what stood between "leaky view" and "no observed impact" while
-- these views were unfixed.
--   - team.tsx (`active_workers`) — filters `.eq('org_id', org)`. Fine.
--   - project-roster.tsx (`active_workers`, add-worker picker) — filters
--     `.eq('org_id', orgId)`. Fine.
--   - generate-report/index.ts (`active_workers`, x2, service-role client)
--     — filters `.eq('org_id', orgId)`. Fine, and also unaffected by this
--     fix regardless: `security_invoker = true` on a service-role query
--     still sees every row, because `service_role` itself has BYPASSRLS —
--     security_invoker changes WHOSE permissions the view's underlying
--     table checks run as, and service_role bypasses those checks either
--     way. Confirming this is actually true (not just reasoned about) is
--     still on the live-verification list this phase, same as
--     attendance_effective's own service-role grant.
--   - worker/[id].tsx (`active_workers`) — queries `.eq('id', id)` ONLY,
--     with NO `.eq('org_id', ...)` filter at all. This is the one call site
--     that did NOT defensively filter, unlike every other one — found by
--     this audit, not assumed clean. Concretely: before this migration, if
--     `rolbypassrls` is true for the view owner (the expected case), any
--     authenticated user who navigated to `/worker/[id]` with a worker id
--     from ANOTHER org would have that worker's full row returned by the
--     view (name, phone, CIN, etc.) — a real cross-org data read, not just
--     a theoretical one. This migration's `security_invoker = true` closes
--     it: with RLS now enforced against the caller, `workers_select_member`
--     (`is_org_member(org_id)`) correctly returns nothing for a worker
--     outside the caller's org, regardless of this screen's own missing
--     filter. Not fixing worker/[id].tsx itself in this migration (a
--     schema-level fix belongs here; a defense-in-depth client filter is a
--     separate, non-schema follow-up item — flagged in this phase's
--     delivery notes, not silently added as a drive-by inside a db/ branch
--     migration).
--   - soft-delete/restore.test.ts (`active_projects`) — queries by `id`
--     inside `asUser(fixtures.owner)`, always the project's own org member.
--     Unaffected by this fix.
--   - No other screen queries `active_projects` directly.
-- =============================================================================

alter view active_projects set (security_invoker = true);
alter view active_workers set (security_invoker = true);

comment on view active_projects is
  'Doc 01 §1.16 — projects excluding soft-deleted rows. security_invoker = true '
  '(added 0037) so RLS is enforced against the querying user, not the view '
  'owner — see 0037''s header for why this mattered and what it fixed.';

comment on view active_workers is
  'Doc 02 §2.10 — workers excluding soft-deleted rows. security_invoker = true '
  '(added 0037) so RLS is enforced against the querying user, not the view '
  'owner — see 0037''s header for why this mattered and what it fixed.';

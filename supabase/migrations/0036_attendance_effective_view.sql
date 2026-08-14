-- =============================================================================
-- 0036_attendance_effective_view.sql
--
-- Doc 01 §1.14.3's actual intent, built for real: "when a manual_pointage
-- row and a dispatch_checkin row both exist for the same worker+date, the
-- manual row is what the UI displays and what payroll reads." That sentence
-- has existed in the spec since Phase 4/5 and is echoed as a comment in two
-- screens (pointage.tsx, (worker)/home.tsx) — but until this migration,
-- nothing in the codebase actually implemented it. attendance_records stays
-- append-only (no unique constraint on worker_id+record_date, no
-- update/delete policy at all, per 0007's own header) — this migration adds
-- a READ-side view on top, changing nothing about how rows are written.
--
-- Investigation done before writing this (Phase 13), not assumed: grepped
-- every mobile screen touching `attendance_records` and found the gap is
-- wider than the two screens with comments about it. Five screens actually
-- compute a day-count or day-status from this table:
--   - pointage.tsx (contractor manual-entry screen) — reads ALL rows for
--     today, sorts by created_at ascending, takes the LAST one per worker
--     to prefill the toggle. If a dispatch check-in landed after a manual
--     entry the same day, this screen was showing the dispatch status, not
--     the manual one — the opposite of its own header comment's claim.
--   - (worker)/home.tsx — write-only (dispatch check-in insert). No read
--     path needed this view; its comment is updated in the same phase to
--     point at this migration instead of an unimplemented intent.
--   - advances.tsx (contractor payroll/advance screen) — summed EVERY
--     attendance_records row per worker in the pay cycle with no dedup by
--     date at all. A worker with both a manual and a dispatch row on the
--     same day was counted TWICE toward gross pay. This is a real
--     money-calculation bug, not a display nuance.
--   - portfolio.tsx (multi-project rollup) — same raw-count pattern for its
--     "worker-days this month" metric; same double-count exposure, lower
--     stakes (a reporting number, not a payroll number).
--   - salary.tsx (worker's own salary view) — builds a statusByDate map
--     keyed by record_date, which avoids double-counting but with NO
--     explicit ORDER BY on the underlying query, so which source "wins" on
--     a conflict day was whatever order Postgres happened to return rows
--     in — not reliably "manual wins" as the spec requires.
--   - advance-request.tsx (worker's own advance-request estimate) — same
--     raw-sum-with-no-dedup pattern as advances.tsx. The estimate shown is
--     informational only (not submitted to request_advance()), but showing
--     an inflated number to a worker deciding whether to request an
--     advance is a real trust/UX bug, not purely cosmetic.
--   - dispatch.tsx's absence-warning query was checked and does NOT need
--     this view: it filters status='absent' directly, and every
--     dispatch_checkin insert in this codebase ((worker)/home.tsx's
--     handleArrived()) always writes status='present' — a dispatch_checkin
--     row can never itself BE the 'absent' status this query looks for, so
--     there's no conflict case here to resolve.
--
-- Same audit extended to supabase/functions (in scope per this phase's own
-- attached-exports list — shared backend, not apps/web or apps/admin
-- turf): generate-report/index.ts's progressionReport,
-- payrollSummaryReport, and cnssDeclarationReport all count
-- attendance_records rows with status='present' directly, same raw-count
-- exposure as advances.tsx/portfolio.tsx. Fixed in the same phase (see
-- delivery notes) to read attendance_effective — this is why the grant
-- below includes service_role, not just authenticated: generate-report
-- runs under the service-role key.
--
-- export-org-data/index.ts also references attendance_records, but
-- deliberately was NOT changed to read this view: that function is a raw
-- data export (Doc 01 §1.16-adjacent GDPR-style "export everything"), where
-- the correct behavior is exporting every underlying row from both
-- sources, not a resolved/collapsed one — an export is expected to be the
-- full source data, not a computed read-path convenience.
--
-- Implementation: one row per (worker_id, record_date), preferring
-- source = 'manual_pointage' when both exist, else the latest row.
-- `distinct on` is the natural fit — Postgres evaluates it against the
-- immediately-following `order by`, so the tie-break logic lives in one
-- place, not scattered across five client-side re-implementations (three of
-- which turned out not to actually implement it correctly, per the audit
-- above — proving the "each screen re-implements the same filter" pattern
-- this view replaces was not a hypothetical risk).
--
-- security_invoker = true (Postgres 15+, which is what Supabase runs) is
-- NOT optional here: without it, a view's underlying-table permission AND
-- row-security checks run as the view's OWNER (typically the migration
-- role, which has BYPASSRLS), not the querying user — meaning the view
-- would silently leak every org's attendance data to any authenticated
-- caller, regardless of attendance_records' own is_org_member()/
-- is_own_worker() policies (0007, 0019). With security_invoker = true, the
-- view has no RLS policies of its own and needs none — every underlying
-- row is still filtered by attendance_records_select_member /
-- attendance_records_select_self exactly as if the caller queried the
-- table directly.
--
-- Disclosed, not silently fixed, and out of THIS migration's scope: the
-- two pre-existing views in this codebase — active_projects (0013) and
-- active_workers (0025) — do NOT set security_invoker and were created
-- before this option was in active use here. Whether they're an actual
-- live RLS bypass depends on which role Supabase's migration runner and
-- view-ownership resolve to in this project's actual hosted/local
-- configuration, which can't be confirmed from a repo export — this needs
-- a live check (the RPC-grants-style query below, adapted for views, or
-- simply `select viewowner from pg_views where viewname in
-- ('active_projects','active_workers')` and cross-referencing against that
-- role's rolbypassrls). Flagged here rather than fixed here: changing
-- those two views' security posture is a separate, focused change that
-- deserves its own review, not a drive-by inside an attendance migration.
-- =============================================================================

create or replace view attendance_effective
  with (security_invoker = true) as
select distinct on (worker_id, record_date)
  id,
  org_id,
  worker_id,
  project_id,
  record_date,
  status,
  source,
  recorded_by,
  created_at
from attendance_records
order by
  worker_id,
  record_date,
  (source = 'manual_pointage') desc,  -- true (manual) sorts before false
  created_at desc;                     -- among same-source rows, latest wins

comment on view attendance_effective is
  'Doc 01 §1.14.3 resolver: one row per (worker_id, record_date), preferring '
  'manual_pointage over dispatch_checkin on conflict, else the latest row. '
  'security_invoker = true so RLS is enforced against the querying user, not '
  'the view owner — see migration header. Read-only; attendance_records '
  'itself is still the only insert target and stays append-only.';

-- Explicit, matching this codebase's own stated discipline (Doc 01 §1.5 /
-- Phase 9's grants audit) of never leaving a new object at whatever the
-- Postgres default happens to be. This mirrors 0016's blanket table grant
-- for `authenticated`; views aren't covered by that migration's `alter
-- default privileges ... on tables` retroactively for a view created later
-- under this migration's own executing role, so it's restated here rather
-- than assumed inherited.
grant select on attendance_effective to authenticated, service_role;

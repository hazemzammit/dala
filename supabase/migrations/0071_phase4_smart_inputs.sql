-- =============================================================================
-- 0071_phase4_smart_inputs.sql
-- Ref: DALA_GAPS_AND_FIXES_PLAN.md §11 "Phase 4 — Smart inputs", §3, §1.1 step 4
--
-- Two new nullable columns — the only two of §3's six fields that didn't
-- already exist as a column somewhere (organizations.trade_type,
-- workers.trade, org_insurances.coverage_type, and the worker-request
-- materials.item were all read directly and confirmed already present
-- before writing this file).
--
-- No RLS policy changes for either column: `safety_incidents` already has
-- a single owner/manager `for all` write policy (0008,
-- safety_incidents_write_owner_manager) with no column-specific check, so
-- the new column is covered automatically. `attendance_records` has TWO
-- insert policies (0007's attendance_records_insert_member — any org
-- member, used by manual_pointage; 0019's attendance_records_insert_self —
-- a worker's own dispatch check-in, restricted to source='dispatch_checkin'
-- with recorded_by null) — absence_reason is only ever set by the
-- manual_pointage path (pointage.tsx), which goes through the member-insert
-- policy, itself column-unrestricted. Same reasoning already used for
-- vehicles.photo_url / workers.photo_url / projects.cover_photo_url in
-- 0070.
-- =============================================================================

alter table safety_incidents add column incident_type text;

comment on column safety_incidents.incident_type is
  'Plan §3 — closed list at the app layer (Chute/Coupure/Électrocution/Accident véhicule, or a free-typed "Autre" value via Select.tsx), required on every NEW incident so the future §2.3 safety-by-category chart has something to group on. Nullable at the DB layer only for rows created before this migration.';

alter table attendance_records add column absence_reason text;

comment on column attendance_records.absence_reason is
  'Plan §1.1 step 4 / §3 — optional context for an ''absent'' status (Maladie/Congé autorisé/Absence non justifiée, or a free-typed "Autre" value via Select.tsx). Not constrained to status=''absent'' by a CHECK constraint — pointage.tsx (the only write path that ever sets this) only shows/sends the field when a worker''s row is toggled to Absent, and attendance_records is append-only, so there is no later edit that could set it inconsistently against an existing row''s status.';

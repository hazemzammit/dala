-- =============================================================================
-- 0052_audit_log_org_and_ip_columns.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.6
--
-- Doc 04 §4.3.6 wants Audit Log filters "by user/org/action/table/date/IP".
-- The API only ever supported table/actorId/action, and checking 0009's
-- actual audit_log definition (the only migration that ever created or
-- altered this table before this one) confirms neither an org-tying
-- column nor an IP column has ever existed here -- not a naming mismatch
-- to work around, a genuine schema gap to close.
--
-- org_id is nullable and NOT backfillable for existing rows: a platform
-- admin action doesn't always have a single owning org (db_explorer
-- actions, admin management, announcements are platform-wide), and even
-- among the actions that do (org.*, and user actions where the acting
-- admin supplied one), there's no reliable way to derive org_id after the
-- fact from target_table/target_id alone for every historical action type
-- without risking a wrong guess baked into the audit trail -- which would
-- be worse than an honest gap. Every row written going forward via
-- logAdminAction() populates it where the call site has one to give; rows
-- written before this migration, and platform-wide actions with no single
-- owning org, keep org_id null.
--
-- ip_address is populated automatically for every new row from here on
-- (apps/admin/src/lib/audit-log.ts reads it via the existing
-- get-client-ip.ts helper, same one middleware.ts's IP-allowlist check
-- already uses) -- historical rows have no IP captured anywhere to
-- backfill from, so they stay null too.
-- =============================================================================

alter table audit_log
  add column org_id     uuid references organizations(id),
  add column ip_address text;

create index audit_log_org_id_idx on audit_log (org_id);

comment on column audit_log.org_id is
  'Nullable -- only populated where the acting route has a single owning
   org for the action (see this migration''s header). Historical rows
   (before 0052) are always null.';
comment on column audit_log.ip_address is
  'Nullable -- captured automatically by logAdminAction() from the
   request''s x-forwarded-for header going forward. Historical rows
   (before 0052) are always null, since nothing captured IP before this.';

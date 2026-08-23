-- =============================================================================
-- 0060_fix_audit_log_actor_id_fk.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.6
--
-- REAL BUG, found while writing apps/admin/tests/audit-log.spec.ts (Tier
-- 2.4) — not a hypothetical, not a test-authoring mistake:
--
-- 0009 created `audit_log.actor_id uuid references profiles(id)`. But the
-- only code in this entire repo that ever inserts into audit_log is
-- apps/admin/src/lib/audit-log.ts's logAdminAction(), and it always
-- writes `actor_id: ctx.admin.id` — a `platform_admins.id` (which
-- references auth.users(id) directly, per 0009's own platform_admins
-- definition), NEVER a `profiles.id`. profiles and platform_admins are
-- two entirely separate tables with no shared id space (confirmed by
-- grepping the whole repo for any other audit_log writer — there is
-- none; 'user'/'system' actor_type values are defined in the CHECK
-- constraint but nothing ever actually inserts one).
--
-- Net effect before this migration: EVERY audit_log insert made by ANY
-- admin action — org.suspend, org.restore, admin.invite, admin.login,
-- admin.reset_totp, db_explorer writes, billing actions, literally every
-- action this whole app's Doc 04 §4.3.6 audit trail depends on — violates
-- this FK and fails at insert time. logAdminAction() catches and logs
-- the error rather than throwing (deliberate log-then-continue design,
-- so a broken audit write never blocks the admin's actual action) — which
-- means every one of these failures has been happening completely
-- silently. The admin app's actions all "work" from the operator's
-- perspective; NONE of them have ever actually been recorded to
-- audit_log. This is why every filter test in audit-log.spec.ts had to
-- seed its own rows directly via the service-role client rather than
-- relying on any prior admin action in the suite to have logged one for
-- real.
--
-- Fix: drop the FK entirely rather than repointing it to platform_admins
-- — actor_type is explicitly a 3-way enum ('user' | 'platform_admin' |
-- 'system'), so a single FK to one table can never be correct for all
-- three. This is also the more standard choice for an audit table
-- specifically: a hard FK to the actor would mean deleting a user/admin
-- account (or a partitioned/archived id) cascades into losing or
-- blocking historical audit rows, which defeats the purpose of an audit
-- trail. actor_id keeps its index (audit_log_actor_id_idx, unaffected —
-- indexes don't require a FK) and its NOT NULL-less nullability; only
-- the FK constraint itself is removed.
-- =============================================================================

alter table audit_log drop constraint audit_log_actor_id_fkey;

comment on column audit_log.actor_id is
  'auth.users(id) OR profiles(id) depending on actor_type (platform_admin
   vs. user) — deliberately no FK (see 0060''s header for why one FK can''t
   be correct for a 3-way actor_type enum, and for the real bug this
   migration fixes: every audit_log insert failed silently before this).';

-- =============================================================================
-- 0058_announcement_email_channel.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.10
-- Ref: migration 0030 (announcement_deliveries, 'push' channel only)
--
-- Admin remediation Tier 2.2 — email channel. 0030's own header disclosed
-- this explicitly as a scope cut: "0022 lets an admin select 'email' as a
-- channel, but wiring an actual Resend send is a third, separate
-- mechanism this pass doesn't build." This migration is that mechanism's
-- schema half; send-announcement-notifications/index.ts is the other half
-- (same migration/function pairing as 0030 itself).
--
-- Widens announcement_deliveries' channel CHECK from ('push') to
-- ('push', 'email') — same de-dup/audit table, same
-- unique(announcement_id, user_id, channel) guard, now covering both send
-- paths. No new table: an email send is the same kind of discrete,
-- loggable event a push send already is (unlike in_app, which is a live
-- pull query, not a send — see 0030's header for why in_app never gets a
-- delivery row).
-- =============================================================================

alter table announcement_deliveries
  drop constraint announcement_deliveries_channel_check,
  add constraint announcement_deliveries_channel_check
    check (channel in ('push', 'email'));

comment on table announcement_deliveries is
  'Doc 06 §6.3 — one row per (announcement, user, channel) send attempt.
   push (0030) and email (0058) both log here; in_app never does (see
   0030''s header — it''s a live pull query, not a discrete send event).
   Unique constraint is the de-dup guard against a re-run after a partial
   failure re-processing an already-logged recipient.';

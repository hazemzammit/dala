-- =============================================================================
-- 0031_scheduled_announcement_firing.sql
-- Ref: Doc 06 §6.3 (Announcements); closes the gap flagged in 0022's and
-- 0030's own headers — "scheduled_for firing" was never built. Push
-- delivery + the in-app-banner read contract (0030) both depend on
-- published_at being set; until now nothing ever set it for a *scheduled*
-- (as opposed to immediately-published) announcement.
--
-- Deliberately a pure-SQL cron job, not an Edge Function: flipping
-- published_at when scheduled_for is due needs no external service call
-- (no Expo, no Resend), so there's nothing an Edge Function would add
-- here except an extra HTTP hop. No Vault secret needed either, unlike
-- 0026/0027/0030's jobs — this one only ever touches Postgres.
-- =============================================================================

create or replace function publish_due_scheduled_announcements()
returns void
language sql
security definer
set search_path = public
as $$
  update announcements
  set published_at = now()
  where scheduled_for is not null
    and scheduled_for <= now()
    and published_at is null;
$$;

comment on function publish_due_scheduled_announcements() is
  'Doc 06 §6.3 — flips published_at for scheduled announcements once scheduled_for is due. Once published_at is set, send-announcement-notifications (0030, cron every 5 min) picks the row up on its next tick the same way it already does for immediately-published announcements — this function does not itself send anything.';

revoke all on function publish_due_scheduled_announcements() from public, anon, authenticated;
grant execute on function publish_due_scheduled_announcements() to service_role;

select cron.schedule(
  'publish-due-scheduled-announcements',
  '* * * * *', -- every minute: a scheduled announcement firing up to a
               -- minute late is a much smaller gap than the 5-minute
               -- push-delivery cadence it feeds into, so this doesn't
               -- become the bottleneck on "how late can a scheduled send
               -- go out".
  $cron$ select publish_due_scheduled_announcements(); $cron$
);

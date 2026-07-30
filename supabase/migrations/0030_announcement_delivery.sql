-- =============================================================================
-- 0030_announcement_delivery.sql
-- Ref: Doc 06 §6.3 (Announcements), 0022_announcements.sql's own header
-- ("Delivery ... is a separate, not-yet-built consumer of this table").
--
-- Scope decision made explicitly this session (not a foregone one): build
-- push delivery + a real in-app-banner read contract. Email delivery is
-- NOT included here — 0022 lets an admin select 'email' as a channel, but
-- wiring an actual Resend send is a third, separate mechanism this pass
-- doesn't build; selecting 'email' today records intent only, same as
-- before this migration. This is a partial delivery build, disclosed as
-- such, not a silent scope expansion.
--
-- What this migration does NOT do, and why:
--   - It does not render any banner UI. apps/web and apps/mobile are each
--     owned by someone else on a separate branch — this migration adds a
--     DB-side contract (get_active_in_app_announcements()) those apps can
--     call, the same shape as get_digest_summary()/
--     get_worker_lateness_pattern() (0025) being DB contracts for screens
--     this session doesn't own either. Building the actual banner
--     component is explicitly out of scope for apps/admin.
--   - It does not handle `scheduled_for` firing. Immediate-publish
--     announcements (published_at set at insert time, the common case per
--     the existing POST route) are what this delivers. Scheduled
--     announcements' actual firing was already flagged as a gap in
--     0022's header and remains one — a second, separate piece of work
--     (something needs to flip scheduled_for → published_at when due),
--     not silently bundled in here.
--
-- Three parts:
--   1. resolve_announcement_recipients() — service-role only, mirrors the
--      exact targeting logic apps/admin's route.ts already uses for the
--      recipient-count estimate (all_users / owners_only / by_plan /
--      by_trade_type / inactive_30d), so the actual send list and the
--      estimate shown to the admin before publishing are computed the
--      same way.
--   2. announcement_deliveries — per-user push-delivery log (de-dup +
--      audit). Only logs channels this migration actually attempts to
--      send (push) — an in_app "delivery" isn't a discrete send event,
--      it's a live pull query, so logging a fake in_app delivery row
--      would misrepresent what happened.
--   3. get_active_in_app_announcements() — authenticated-callable read
--      RPC for the in-app banner. "Active" window is a 14-day judgment
--      call (spec doesn't define an expiry for announcements) — disclosed
--      here rather than picked silently.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — recipient resolution (service-role only; used by the Edge
-- Function below, never reachable via a normal authenticated JWT)
-- ---------------------------------------------------------------------------

create or replace function resolve_announcement_recipients(p_announcement_id uuid)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_type  text;
  v_target_value text;
begin
  select target_type, target_value into v_target_type, v_target_value
  from announcements where id = p_announcement_id;

  if v_target_type is null then
    return;
  end if;

  if v_target_type = 'all_users' then
    return query select p.id from profiles p;

  elsif v_target_type = 'owners_only' then
    return query
      select distinct om.user_id from organization_members om where om.role = 'owner';

  elsif v_target_type = 'by_plan' then
    return query
      select distinct om.user_id
      from organization_members om
      join organizations o on o.id = om.org_id
      where o.plan = v_target_value;

  elsif v_target_type = 'by_trade_type' then
    return query
      select distinct om.user_id
      from organization_members om
      join organizations o on o.id = om.org_id
      where o.trade_type = v_target_value;

  elsif v_target_type = 'inactive_30d' then
    return query
      select p.id from profiles p
      where p.last_login_at < now() - interval '30 days';
  end if;
end;
$$;

revoke all on function resolve_announcement_recipients(uuid) from public, anon, authenticated;
grant execute on function resolve_announcement_recipients(uuid) to service_role;

comment on function resolve_announcement_recipients(uuid) is
  'Doc 06 §6.3 Announcements delivery — same five target_type branches as apps/admin''s route.ts estimateRecipients(), computed server-side so the actual send list matches the estimate the admin saw before publishing. service_role only — called from send-announcement-notifications.';

-- ---------------------------------------------------------------------------
-- Part 2 — per-user push delivery log (de-dup + audit)
-- ---------------------------------------------------------------------------

create table announcement_deliveries (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  channel         text not null check (channel in ('push')),
  status          text not null check (status in ('sent', 'skipped_no_token', 'failed')),
  created_at      timestamptz not null default now(),
  unique (announcement_id, user_id, channel)
);

comment on table announcement_deliveries is
  'Doc 06 §6.3 — one row per (announcement, user, channel) push-send attempt. Unique constraint is the de-dup guard: send-announcement-notifications only ever processes an announcement once per user per channel, even if the Edge Function runs again before announcements.delivered_at is set.';

create index announcement_deliveries_announcement_id_idx on announcement_deliveries (announcement_id);

alter table announcement_deliveries enable row level security;
-- No client policies — written only by the service-role Edge Function,
-- same reasoning as announcements itself (0022).

alter table announcements add column delivered_at timestamptz;

comment on column announcements.delivered_at is
  'Set once send-announcement-notifications has processed every resolved recipient for this announcement (push channel only — see migration header). NULL means either not yet due (published_at still null) or currently being/not yet processed.';

-- ---------------------------------------------------------------------------
-- Part 3 — in-app banner read contract (for apps/web / apps/mobile to call)
-- ---------------------------------------------------------------------------

create or replace function get_active_in_app_announcements()
returns table (id uuid, message text, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select a.id, a.message, a.published_at
    from announcements a
    where 'in_app' = any(a.channels)
      and a.published_at is not null
      and a.published_at >= now() - interval '14 days' -- judgment call, see migration header
      and (
        a.target_type = 'all_users'
        or (a.target_type = 'owners_only' and exists (
          select 1 from organization_members om
          where om.user_id = auth.uid() and om.role = 'owner'
        ))
        or (a.target_type = 'by_plan' and exists (
          select 1 from organization_members om
          join organizations o on o.id = om.org_id
          where om.user_id = auth.uid() and o.plan = a.target_value
        ))
        or (a.target_type = 'by_trade_type' and exists (
          select 1 from organization_members om
          join organizations o on o.id = om.org_id
          where om.user_id = auth.uid() and o.trade_type = a.target_value
        ))
        or (a.target_type = 'inactive_30d' and exists (
          select 1 from profiles p
          where p.id = auth.uid() and p.last_login_at < now() - interval '30 days'
        ))
      )
    order by a.published_at desc;
end;
$$;

grant execute on function get_active_in_app_announcements() to authenticated;

comment on function get_active_in_app_announcements() is
  'Doc 06 §6.3 — DB-side contract for the in-app banner. Returns announcements targeted at the calling user (auth.uid()), channel includes in_app, published in the last 14 days. Rendering the banner itself is apps/web''s / apps/mobile''s own work — not built here, per Doc 05 §3.6''s ownership split (admin never touches those apps'' source).';

-- ---------------------------------------------------------------------------
-- Part 4 — schedule send-announcement-notifications via pg_cron + pg_net
-- ---------------------------------------------------------------------------
-- Reuses the SAME two Vault secrets 0026 already requires
-- (cron_edge_function_base_url, cron_service_role_key) — both are already
-- generic (a base URL and a service-role key, not scoped to any one
-- function), so no new secret needs registering for this job.

select cron.schedule(
  'send-announcement-notifications',
  '*/5 * * * *', -- more frequent than the 15-minute impersonation job: an
                 -- announcement an admin just published should go out
                 -- promptly, not sit for up to a quarter hour.
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'cron_edge_function_base_url'
    ) || '/send-announcement-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cron_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

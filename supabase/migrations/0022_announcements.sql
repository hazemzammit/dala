-- =============================================================================
-- 0022_announcements.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.10
--
-- No announcements table existed anywhere in the schema before this —
-- §4.3.10 describes the screen but the prior migrations never created
-- what it reads/writes. Added here rather than left as an unbacked stub,
-- since the shape is simple and unambiguous from the spec text.
-- =============================================================================

create table announcements (
  id                 uuid primary key default gen_random_uuid(),
  created_by         uuid not null references platform_admins(id),
  message            text not null,
  -- §4.3.10: "Canal (in-app banner / email / push — multi-select)"
  channels           text[] not null check (
    channels <@ array['in_app', 'email', 'push']::text[] and array_length(channels, 1) > 0
  ),
  -- §4.3.10: "Cible (Tous les utilisateurs / Propriétaires uniquement /
  -- par plan / par type d'activité / Inactifs 30+ jours)"
  target_type        text not null check (
    target_type in ('all_users', 'owners_only', 'by_plan', 'by_trade_type', 'inactive_30d')
  ),
  -- Only meaningful when target_type = 'by_plan' or 'by_trade_type'; NULL otherwise.
  target_value       text,
  scheduled_for      timestamptz, -- NULL = send immediately on publish
  published_at       timestamptz, -- set once actually sent/scheduled-and-fired
  estimated_recipient_count integer, -- snapshot at publish time, shown in the preview panel before sending
  created_at         timestamptz not null default now()
);

create index announcements_created_at_idx on announcements (created_at desc);

alter table announcements enable row level security;
-- No client policies: written only via apps/admin's service-role route
-- handlers, read by mobile/web through a separate lightweight RPC that
-- doesn't exist yet (out of scope for this migration — that's the
-- delivery mechanism, not the admin authoring surface).

comment on table announcements is
  'Doc 04 §4.3.10 — admin-authored broadcast messages. Delivery (in-app
   banner rendering, actual email/push send) is a separate, not-yet-built
   consumer of this table; this migration only covers the authoring side.';

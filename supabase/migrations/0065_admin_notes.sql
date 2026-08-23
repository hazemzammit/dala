-- =============================================================================
-- 0065_admin_notes.sql
-- Ref: docs/spec/04-screens-web-contractor-and-admin.md §4.3.3/§4.3.4
--
-- Admin remediation Tier 4.8 — internal notes / lightweight CRM layer.
-- Free-text context an admin leaves on an org or user (e.g. "spoke to
-- them about their overdue invoice, they said payment is coming Friday")
-- that doesn't belong in audit_log (audit_log is a record of ACTIONS —
-- what changed and who changed it — not free-text commentary with no
-- state change behind it) and has nowhere else in this schema to live.
--
-- Append-mostly: edit/delete allowed for the original author or a Super
-- Admin (not any admin — a note left by one admin about a sensitive
-- conversation shouldn't be silently editable by every other admin),
-- both logged to audit_log same as every other mutating admin action in
-- this app (Doc 04 §4.3.6).
-- =============================================================================

create table admin_notes (
  id               uuid primary key default gen_random_uuid(),
  target_type      text not null check (target_type in ('org', 'user')),
  target_id        uuid not null,
  author_admin_id  uuid not null references platform_admins(id),
  body             text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index admin_notes_target_idx on admin_notes (target_type, target_id, created_at desc);

alter table admin_notes enable row level security;

-- service_role only — same pattern as every other admin-only table in
-- this app (apps/admin reads/writes through its own server-side routes,
-- which enforce the author-or-super-admin edit/delete rule at the
-- application layer, same as every other role check in this codebase —
-- see api/admin/notes/[noteId]/route.ts).
revoke all on admin_notes from public, anon, authenticated;
grant select, insert, update, delete on admin_notes to service_role;

comment on table admin_notes is
  'Doc 04 §4.3.3/§4.3.4 / admin remediation Tier 4.8. Free-text internal
   context on an org or user — not an audit record (see audit_log for
   that), just commentary with no state change behind it. Edit/delete
   restricted to the original author or a Super Admin, enforced in
   api/admin/notes routes, both logged to audit_log as note.update/
   note.delete.';

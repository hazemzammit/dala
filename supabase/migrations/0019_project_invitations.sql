-- =============================================================================
-- 0019_project_invitations.sql
-- Ref: docs/spec/06-besoins-fonctionnels.md §6.8 (collaboration inter-entreprises)
--
-- Mirrors worker_invitations' shape (migration 0004): the invited party
-- doesn't have an account yet at invite time, so we store their name/phone
-- as free text rather than a foreign key, and resolve to a real org_id only
-- once (if ever) they accept — that acceptance flow isn't built yet
-- (Doc 06 §6.8's full loop needs a signup path for the invited company,
-- out of scope for this iteration; flagged for Hazem).
-- =============================================================================

create table project_invitations (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,
  inviting_org_id       uuid not null references organizations(id) on delete cascade,
  invited_org_name      text not null,
  invited_contact_phone text not null,
  role                  text not null check (role in ('trade', 'client')),
  token                 text not null unique,
  channel               text not null check (channel in ('app', 'whatsapp', 'sms')),
  status                text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  sent_at               timestamptz not null default now(),
  expires_at            timestamptz not null default now() + interval '7 days',
  accepted_at           timestamptz
);

create index project_invitations_project_id_idx on project_invitations (project_id);

alter table project_invitations enable row level security;

-- Doc 01 §1.5 — is_org_member(inviting_org_id)/org_role_of(inviting_org_id):
-- only the inviting org (the one whose lead sent it) can see/manage its own
-- outgoing invitations. Not is_project_member() — an invited 'trade' org
-- hasn't joined the project yet, so it can't see other pending invites on
-- it either, same boundary worker_invitations draws for its own org.
create policy "project_invitations_select_inviting_org"
  on project_invitations for select
  using (is_org_member(inviting_org_id));

create policy "project_invitations_write_owner_manager"
  on project_invitations for all
  using (org_role_of(inviting_org_id) in ('owner', 'manager'));

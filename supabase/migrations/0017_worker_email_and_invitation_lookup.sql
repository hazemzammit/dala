-- =============================================================================
-- 0017_worker_email_and_invitation_lookup.sql
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.13.2, §3.8
-- Ref: docs/spec/00-foundations-vision-and-decisions.md §0.5 item 10
--
-- Two fixes, both needed to actually ship the worker roster/invite screen:
--
-- 1. `workers` was missing an `email` column. Doc 00 §0.5 item 10 is explicit
--    ("every worker has an email address... email + password is the single
--    auth path for every account type"), and Doc 03 §3.13.2 lists Email as a
--    *required* field on the invite form — but 0004_workers.sql never added
--    the column and packages/validation/src/dispatch.ts's inviteWorkerSchema
--    never required it either. This migration closes that gap; the
--    validation-package fix ships in the same PR (see inviteWorkerSchema).
--
-- 2. The worker accept-invitation screen (§3.8) runs BEFORE the worker has an
--    account — there is no auth.uid() yet, so the existing
--    "worker_invitations_select_member" policy (org-member only) can't be
--    used to resolve a token into a name/email/org for display. This needs
--    the same anon-safe SECURITY DEFINER pattern already used for
--    app_version_check (0011) and find_user_id_by_email (0015) — a narrow,
--    single-purpose function, not a relaxed table policy.
-- =============================================================================

alter table workers add column email text;

-- Not NOT NULL: existing seeded/dev rows may predate this column, and a
-- backfill migration is a separate, deliberate step (see README note below)
-- rather than something to silently default here. New invites always supply
-- it — enforced at the application layer via inviteWorkerSchema, same
-- division of responsibility as matricule_fiscal/rc_number (Doc 01 §1.3.13).
comment on column workers.email is
  'Required by the app for every NEW invite (Doc 00 §0.5 item 10); nullable at '
  'the DB layer only to avoid breaking any pre-existing seeded rows. Backfill '
  'existing NULLs before relying on this for uniqueness checks.';

create unique index workers_org_id_email_idx on workers (org_id, lower(email))
  where email is not null;

alter table workers add column search_vector_v2 tsvector
  generated always as (
    to_tsvector('french', coalesce(full_name, '') || ' ' || coalesce(trade, '') || ' ' || coalesce(email, ''))
  ) stored;
drop index if exists workers_search_idx;
create index workers_search_idx on workers using gin (search_vector_v2);
alter table workers drop column search_vector;
alter table workers rename column search_vector_v2 to search_vector;

-- Anon-safe lookup for the invite-acceptance screen (§3.8). Returns only the
-- fields the screen needs to render read-only identity + org name — never
-- the full worker/organization row, and never anything for an
-- already-accepted or expired invitation beyond its status (so the screen
-- can show the right edge-case copy without leaking data).
create or replace function get_worker_invitation_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'worker_full_name', w.full_name,
    'worker_email', w.email,
    'organization_name', o.name,
    'status', wi.status,
    'expired', wi.expires_at < now()
  )
  from worker_invitations wi
  join workers w on w.id = wi.worker_id
  join organizations o on o.id = w.org_id
  where wi.token = p_token;
$$;

grant execute on function get_worker_invitation_by_token(text) to anon;

comment on function get_worker_invitation_by_token(text) is
  'Anon-safe, token-scoped lookup for the worker accept-invitation screen '
  '(Doc 03 §3.8), which runs before the worker has a session. Mirrors the '
  'app_version_check (0011) pattern: narrow SECURITY DEFINER function, not a '
  'relaxed RLS policy on worker_invitations/workers.';

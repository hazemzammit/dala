-- =============================================================================
-- 0084_phase13_connected_devices.sql
-- Gap-closure guide §2.6 (Part 2 enhancements) — "Appareils connectés"
--
-- Explicitly authorized by Hazem after a stop-and-flag: the guide claimed
-- this was "identical to mobile's active sessions list," but mobile's
-- security-settings.tsx has no such section, and nothing before this
-- migration exposed per-session data to a regular contractor user (only
-- Platform Admin's own admin-login audit trail exists, migration 0067,
-- a different, unrelated thing). This is genuinely new backend work, not
-- a port — see the two RPCs below.
--
-- Scope deliberately narrow: session id, created_at, updated_at (used as
-- "last active"), and which one is the caller's current session — plus
-- revoke-a-session. NOT included: device/browser/OS or city-level
-- location. `auth.sessions` in this project's base schema (the portable,
-- open-source GoTrue columns — user_id, created_at, updated_at, factor_id,
-- aal, not_after) has no user-agent/IP columns to read from; some
-- Supabase-hosted projects do have extra `user_agent`/`ip` columns added
-- by the hosted platform outside the open-source migration set, but that
-- isn't something this migration can safely assume exists without risking
-- a broken migration on a project where it doesn't. If Hazem confirms his
-- project has those columns, `list_own_sessions()` can be extended in a
-- follow-up — flagged here rather than guessed at.
--
-- `session_id` is a required, always-present Supabase Auth JWT claim
-- (auth.jwt() ->> 'session_id') that corresponds 1:1 to a row in
-- auth.sessions — used here to mark/protect the caller's own current
-- session, same idea as the `aal` claim check migration 0029 already
-- relies on for 2FA.
-- =============================================================================

create or replace function list_own_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  is_current boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    s.id,
    s.created_at,
    s.updated_at,
    s.id = (auth.jwt() ->> 'session_id')::uuid as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.updated_at desc;
$$;

comment on function list_own_sessions() is
  'Doc gap-closure §2.6 — lists the calling user''s own auth.sessions rows only (never another user''s, enforced by the user_id = auth.uid() filter inside this SECURITY DEFINER body, not by caller-supplied input). Flags the caller''s current session via the session_id JWT claim.';

grant execute on function list_own_sessions() to authenticated;

create or replace function revoke_own_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_session_id = (auth.jwt() ->> 'session_id')::uuid then
    raise exception 'Impossible de déconnecter la session actuelle depuis cet écran.' using errcode = '42501';
  end if;

  -- auth.refresh_tokens.user_id is text (a long-standing GoTrue schema
  -- quirk), unlike auth.sessions.user_id which is uuid — cast explicitly.
  delete from auth.refresh_tokens
    where session_id = p_session_id and user_id = auth.uid()::text;

  delete from auth.sessions
    where id = p_session_id and user_id = auth.uid();

  if not found then
    raise exception 'Session introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function revoke_own_session(uuid) is
  'Doc gap-closure §2.6 — revokes one of the caller''s own sessions (never another user''s: both deletes are scoped to user_id = auth.uid() inside this SECURITY DEFINER body). Refuses to revoke the session making this very call, mirroring how mobile/web already prevent deleting your own account access mid-session elsewhere.';

grant execute on function revoke_own_session(uuid) to authenticated;

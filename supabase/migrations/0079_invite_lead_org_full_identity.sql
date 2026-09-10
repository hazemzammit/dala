-- Migration 0079 — full inviting-org identity on the anonymous accept-invite screen
--
-- Decision made explicitly by Hazem (org-creation-guide/gaps follow-on):
-- an anonymous, no-account-yet invite recipient (accept-org-invite.tsx)
-- should see the SAME full identity an already-authenticated collaborator
-- sees on collaboration.tsx (migration 0078) — name, logo, trade_type,
-- legal_form, verification_status — not a reduced anonymous-safe subset.
-- This is a deliberate, wider exposure than 0078's own default reasoning
-- would have picked unprompted; it is scoped to exactly this one
-- SECURITY DEFINER function, still excludes matricule_fiscal/rc_number/
-- RIB/subscription_status entirely, and does not touch organizations' own
-- RLS or any other anon-reachable surface.
--
-- Widens get_project_invitation_by_token (0024) rather than replacing it,
-- to avoid breaking accept-org-invite.tsx's existing reads of
-- `lead_org_name` and `trade_type` (the INVITE's own required trade —
-- e.g. "they need a plumber" — a different field from the lead org's own
-- trade_type, which is why the new keys below are prefixed `lead_org_`
-- rather than reusing `trade_type`).
--
-- Converted from `language sql` to `language plpgsql` solely to gain the
-- same exception-safe logo-signing fallback 0076's client-portal signer
-- and 0078 both already established (storage.create_signed_url isn't
-- guaranteed callable as plain SQL across every installed Storage
-- extension version — confirmed uncertain by reading the installed
-- extension's own catalog comments, not by running this against a live
-- instance; no Docker/live Supabase in this sandbox, same standing
-- constraint disclosed in every migration touching
-- storage.create_signed_url so far). A broken signing call must not take
-- down the entire invite-acceptance screen for an anonymous visitor who
-- has no other way to retry — better to show a name with no logo.
create or replace function get_project_invitation_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_logo_signed_url text;
begin
  select
    case
      when o.logo_url is null then null
      else (select signed_url from storage.create_signed_url('org-files', o.logo_url, 3600))
    end
  into v_logo_signed_url
  from project_invitations pi
  join organizations o on o.id = pi.lead_org_id
  where pi.token = p_token;

  return (
    select jsonb_build_object(
      'project_id', pi.project_id,
      'project_name', p.name,
      'lead_org_name', o.name,
      'lead_org_logo_signed_url', v_logo_signed_url,
      'lead_org_trade_type', o.trade_type,
      'lead_org_legal_form', o.legal_form,
      'lead_org_verification_status', o.verification_status,
      'trade_type', pi.trade_type,
      'status', pi.status,
      'expired', pi.expires_at < now()
    )
    from project_invitations pi
    join projects p on p.id = pi.project_id
    join organizations o on o.id = pi.lead_org_id
    where pi.token = p_token
  );
exception
  when others then
    return (
      select jsonb_build_object(
        'project_id', pi.project_id,
        'project_name', p.name,
        'lead_org_name', o.name,
        'lead_org_logo_signed_url', null,
        'lead_org_trade_type', o.trade_type,
        'lead_org_legal_form', o.legal_form,
        'lead_org_verification_status', o.verification_status,
        'trade_type', pi.trade_type,
        'status', pi.status,
        'expired', pi.expires_at < now()
      )
      from project_invitations pi
      join projects p on p.id = pi.project_id
      join organizations o on o.id = pi.lead_org_id
      where pi.token = p_token
    );
end;
$$;

grant execute on function get_project_invitation_by_token(text) to anon;

comment on function get_project_invitation_by_token(text) is
  'Anon-safe, token-scoped lookup for the org-to-org accept-invite screen, '
  'which may run before the invited party has any session at all. Mirrors '
  'get_worker_invitation_by_token (0017). Widened (org-creation-guide/gaps '
  'follow-on, migration 0079) to also expose the lead org''s own logo '
  '(signed server-side, same as 0078)/trade_type/legal_form/'
  'verification_status — a deliberate decision to show an anonymous '
  'invitee the same full identity an authenticated collaborator sees on '
  'collaboration.tsx, not the narrower anon-default subset. Still never '
  'exposes matricule_fiscal/rc_number/RIB/subscription_status.';

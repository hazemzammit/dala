-- =============================================================================
-- 0082_org_social_links_and_worker_invite_identity_parity.sql
--
-- Closes two related Pattern-3/Pattern-8-shaped gaps found in a follow-up
-- audit pass, both confirmed by reading actual RPC field lists against the
-- schema, not assumed:
--
-- PART 1 — organizations.facebook_url/instagram_url/website_url
-- (migration 0075) have been write-only since the day they were added.
-- 0075's own column comment on facebook_url is explicit about intent:
-- "Facebook/Instagram matter more than a website for Tunisian trades" —
-- these are meant to be part of an org's outward identity, not a private
-- admin note. But get_shared_project_org_summaries (0078) and
-- get_project_invitation_by_token's lead_org_* widening (0079) both
-- shipped without them, despite both already exposing service_area —
-- added in that SAME migration (0075), with the same "public profile"
-- framing, to the SAME two RPCs. No comment anywhere explains omitting
-- the social/website fields specifically; reads as an oversight, not a
-- decision. Fixed by adding all three to both RPCs' existing safe-subset
-- shape — still never matricule_fiscal/rc_number/RIB/subscription_status,
-- the same boundary both migrations already drew.
--
-- PART 2 — get_worker_invitation_by_token (0017) returns only
-- worker_full_name/worker_email/organization_name/status/expired: a bare
-- org name, no logo, no trade_type/legal_form/verification_status. Migration
-- 0079 already established, for accept-org-invite.tsx, that an anonymous
-- no-account-yet invite recipient should see the SAME full org identity an
-- authenticated collaborator sees on collaboration.tsx — but that decision
-- was scoped to the org-to-org invite flow and never revisited for the
-- worker-invite flow sitting right next to it, which is conceptually the
-- same "an org is inviting you" moment. Applying 0079's own precedent here
-- by parity — a worker joining an org has at least as much reason to see
-- who's inviting them as a trade partner does. THIS PART, UNLIKE PART 1,
-- IS A JUDGMENT CALL MADE WITHOUT EXPLICIT PRODUCT SIGN-OFF (0079's
-- widening for accept-org-invite.tsx was; this one is reasoned from that
-- precedent, not separately confirmed) — flagged here rather than silently
-- assumed; easy to revert to the narrower original if that call is wrong.
-- Converted from `language sql` to `language plpgsql` solely to gain the
-- same exception-safe logo-signing fallback 0076/0078/0079 already
-- established (storage.create_signed_url's cross-version callability as
-- plain SQL remains unconfirmed against a live instance in this sandbox).

drop function if exists get_shared_project_org_summaries(uuid[]);

create function get_shared_project_org_summaries(p_org_ids uuid[])
returns table (
  id uuid,
  name text,
  logo_signed_url text,
  trade_type text,
  legal_form text,
  verification_status text,
  address text,
  service_area text,
  facebook_url text,
  instagram_url text,
  website_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_org_ids uuid[];
begin
  select array_agg(org_id) into v_caller_org_ids
  from organization_members
  where user_id = auth.uid();

  return query
  select
    o.id,
    o.name,
    case
      when o.logo_url is null then null
      else (
        select signed_url from storage.create_signed_url('org-files', o.logo_url, 3600)
      )
    end,
    o.trade_type,
    o.legal_form,
    o.verification_status,
    o.address,
    o.service_area,
    o.facebook_url,
    o.instagram_url,
    o.website_url
  from organizations o
  where o.id = any(p_org_ids)
    and (
      o.id = any(v_caller_org_ids)
      or exists (
        select 1
        from projects p
        where (
          p.lead_org_id = any(v_caller_org_ids)
          or exists (
            select 1 from project_memberships pm_caller
            where pm_caller.project_id = p.id and pm_caller.org_id = any(v_caller_org_ids)
          )
        )
        and (
          p.lead_org_id = o.id
          or exists (
            select 1 from project_memberships pm_target
            where pm_target.project_id = p.id and pm_target.org_id = o.id
          )
        )
      )
    );
exception
  when others then
    return query
    select o.id, o.name, null::text, o.trade_type, o.legal_form, o.verification_status,
           o.address, o.service_area, o.facebook_url, o.instagram_url, o.website_url
    from organizations o
    where o.id = any(p_org_ids)
      and (
        o.id = any(v_caller_org_ids)
        or exists (
          select 1
          from projects p
          where (
            p.lead_org_id = any(v_caller_org_ids)
            or exists (
              select 1 from project_memberships pm_caller
              where pm_caller.project_id = p.id and pm_caller.org_id = any(v_caller_org_ids)
            )
          )
          and (
            p.lead_org_id = o.id
            or exists (
              select 1 from project_memberships pm_target
              where pm_target.project_id = p.id and pm_target.org_id = o.id
            )
          )
        )
      );
end;
$$;

revoke execute on function get_shared_project_org_summaries(uuid[]) from public, anon;
grant execute on function get_shared_project_org_summaries(uuid[]) to authenticated;

comment on function get_shared_project_org_summaries(uuid[]) is
  'Batch, permission-scoped lookup of a safe subset of organizations rows '
  '(name/logo_signed_url/trade_type/legal_form/verification_status/'
  'address/service_area/facebook_url/instagram_url/website_url) for orgs '
  'the caller either belongs to, or shares a project with. Widened in '
  '0082 to add facebook_url/instagram_url/website_url, which 0078 shipped '
  'without despite service_area (added in the same source migration, '
  '0075, with the same intent) already being included — see 0082''s '
  'header. Still deliberately excludes matricule_fiscal/rc_number/'
  'rib_encrypted/rib_last4/subscription_status.';

-- ---------------------------------------------------------------------------

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
      'lead_org_facebook_url', o.facebook_url,
      'lead_org_instagram_url', o.instagram_url,
      'lead_org_website_url', o.website_url,
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
        'lead_org_facebook_url', o.facebook_url,
        'lead_org_instagram_url', o.instagram_url,
        'lead_org_website_url', o.website_url,
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
  'Anon-safe, token-scoped lookup for the org-to-org accept-invite screen. '
  'Widened in 0082 to add lead_org_facebook_url/lead_org_instagram_url/'
  'lead_org_website_url alongside the identity fields 0079 already added — '
  'see 0082''s header for why these were missing despite service_area '
  '(added in the same source migration as the socials, 0075) already '
  'being exposed via 0078. Still never exposes matricule_fiscal/'
  'rc_number/RIB/subscription_status.';

-- ---------------------------------------------------------------------------

create or replace function get_worker_invitation_by_token(p_token text)
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
  from worker_invitations wi
  join workers w on w.id = wi.worker_id
  join organizations o on o.id = w.org_id
  where wi.token = p_token;

  return (
    select jsonb_build_object(
      'worker_full_name', w.full_name,
      'worker_email', w.email,
      'organization_name', o.name,
      'organization_logo_signed_url', v_logo_signed_url,
      'organization_trade_type', o.trade_type,
      'organization_legal_form', o.legal_form,
      'organization_verification_status', o.verification_status,
      'organization_facebook_url', o.facebook_url,
      'organization_instagram_url', o.instagram_url,
      'organization_website_url', o.website_url,
      'status', wi.status,
      'expired', wi.expires_at < now()
    )
    from worker_invitations wi
    join workers w on w.id = wi.worker_id
    join organizations o on o.id = w.org_id
    where wi.token = p_token
  );
exception
  when others then
    return (
      select jsonb_build_object(
        'worker_full_name', w.full_name,
        'worker_email', w.email,
        'organization_name', o.name,
        'organization_logo_signed_url', null,
        'organization_trade_type', o.trade_type,
        'organization_legal_form', o.legal_form,
        'organization_verification_status', o.verification_status,
        'organization_facebook_url', o.facebook_url,
        'organization_instagram_url', o.instagram_url,
        'organization_website_url', o.website_url,
        'status', wi.status,
        'expired', wi.expires_at < now()
      )
      from worker_invitations wi
      join workers w on w.id = wi.worker_id
      join organizations o on o.id = w.org_id
      where wi.token = p_token
    );
end;
$$;

grant execute on function get_worker_invitation_by_token(text) to anon;

comment on function get_worker_invitation_by_token(text) is
  'Anon-safe, token-scoped lookup for the worker accept-invitation screen, '
  'which runs before the worker has a session. Widened in 0082 to expose '
  'the same org identity richness (logo/trade_type/legal_form/'
  'verification_status/facebook_url/instagram_url/website_url) that 0079 '
  'gave get_project_invitation_by_token for the org-to-org invite flow — '
  'applied here by parity, not a separately confirmed product decision; '
  'see 0082''s header. Existing worker_full_name/worker_email/'
  'organization_name/status/expired keys are unchanged, so accept-invite.tsx '
  'continues to work even before it reads the new keys.';

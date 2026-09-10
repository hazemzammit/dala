-- Migration 0078 — cross-org identity for shared-project collaborators
--
-- Closes a real, currently-shipping display bug in
-- apps/mobile/src/app/(contractor)/collaboration.tsx: both of that
-- screen's org-name lookups —
--   .select('*, organizations(name)')                on project_memberships
--   .from('organizations').select('id, name').in(...) for lead orgs
-- are silently blocked by `organizations`' only SELECT policy
-- (`organizations_select_member`, migration 0005), which checks
-- `is_org_member(id)` — same-org membership only, with no carve-out for
-- "shares a project with my org." Every fellow collaborator's name has
-- been resolving to null and falling back to the screen's own `'—'`
-- placeholder, not just in some edge case — this is the normal path for
-- any two different orgs collaborating on a shared project today.
--
-- Deliberately NOT fixed by widening organizations' own RLS policy. A
-- blanket "can read if sharing a project" SELECT policy would expose the
-- WHOLE row — including matricule_fiscal, rc_number, and (though the
-- ciphertext column itself is never selected by any client per 0075's own
-- convention) would still be a wider blast radius than this feature
-- needs. Instead, a purpose-built SECURITY DEFINER RPC returns only a
-- safe, non-sensitive subset, same reasoning 0025's is_shared_site_log_file
-- and get_project_invitation_by_token (0024) already established for
-- similar "let someone see a narrow slice of another org's data" needs.
--
-- Also closes the adjacent problem of cross-org LOGO access: org-files
-- storage RLS (0020) only grants read access to members/workers of that
-- SAME org, or (0025) to specifically-shared site-log attachments —
-- nothing covers general cross-org files like a logo. Rather than add yet
-- another storage.objects policy, this RPC signs the logo server-side
-- itself, exactly mirroring 0076's client-portal logo-signing function
-- (same bucket, same storage.create_signed_url call, same
-- exception-safe "fall back to null, never a hard error" shape) — so the
-- client never touches a raw, unsignable storage path for another org's
-- files at all.
--
-- IMPORTANT correctness note, caught before this shipped: a naive
-- "both orgs have a project_memberships row on the same project_id" join
-- would have silently reproduced the exact bug this migration fixes. Per
-- 0034's own header comment: no code path anywhere in this schema ever
-- inserts a `role = 'lead'` row into project_memberships — a lead org's
-- association with its own project exists ONLY via projects.lead_org_id,
-- never a project_memberships row. So looking up "the lead org of a
-- project I'm a trade participant on" (exactly collaboration.tsx's
-- "Chantiers auxquels je participe" case) MUST check projects.lead_org_id
-- directly, not project_memberships on both sides — 0034 introduced
-- is_project_participant() for this same reason, though that helper is
-- scoped to the CALLING user's own org and isn't parameterized by an
-- arbitrary target org, so it isn't reusable here as-is; the same
-- lead-or-membership shape is inlined below for an arbitrary target org.

create or replace function get_shared_project_org_summaries(p_org_ids uuid[])
returns table (
  id uuid,
  name text,
  logo_signed_url text,
  trade_type text,
  legal_form text,
  verification_status text,
  address text,
  service_area text
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
    o.service_area
  from organizations o
  where o.id = any(p_org_ids)
    and (
      -- caller's own org(s) among the requested ids — always visible,
      -- independent of project participation
      o.id = any(v_caller_org_ids)
      -- OR both orgs are associated (as lead OR as a trade/client
      -- project_memberships row — never assume either side has a
      -- membership row, since lead orgs never do) with the same project
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
  -- Same fallback shape as 0076's client-portal signer: storage.
  -- create_signed_url isn't guaranteed callable as plain SQL across every
  -- installed Storage extension version (confirmed uncertain by reading
  -- the installed extension's own catalog comments, not by running this
  -- against a live instance — no Docker/live Supabase in this sandbox,
  -- same standing constraint disclosed in every migration touching
  -- storage.create_signed_url so far). A broken signing call should never
  -- take down the whole collaboration screen — better to show a name
  -- with no logo than an error.
  when others then
    return query
    select o.id, o.name, null::text, o.trade_type, o.legal_form, o.verification_status,
           o.address, o.service_area
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
  'address/service_area) for orgs the caller either belongs to, or shares '
  'a project with — checking projects.lead_org_id directly on both sides '
  'rather than assuming a project_memberships row exists for the lead org '
  '(it never does, per 0034). Built for collaboration.tsx, which '
  'previously could not read a fellow collaborators org row at all under '
  'organizations_select_member (0005) — see this migrations header for '
  'the full reasoning, including why this is a narrow RPC rather than a '
  'wider organizations RLS policy. Deliberately excludes '
  'matricule_fiscal/rc_number/rib_encrypted/rib_last4/subscription_status '
  'and every other owner-only or system-only column — a fellow project '
  'collaborator sees the same "public profile" slice a client-facing '
  'view would, nothing more.';

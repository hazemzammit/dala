-- =============================================================================
-- 0018_org_members_directory_rpc.sql
-- Ref: docs/spec/06-besoins-fonctionnels.md §6.9 (rôles et permissions)
--
-- profiles' RLS policy (migration 0005) only lets a user read their own row
-- (id = auth.uid()) — correct for privacy, but it means a plain join from
-- organization_members to profiles silently returns null names for every
-- member except the caller. This function is the narrow, documented escape
-- hatch (same pattern as is_org_member/org_role_of, migration 0005): it
-- runs as security definer to bypass profiles' own RLS, but only returns
-- rows for organizations the CALLER (auth.uid()) is themselves a member of
-- — so it can't be used to browse arbitrary orgs, just "my org's roster".
-- =============================================================================
create or replace function org_members_directory(target_org uuid)
returns table (
  user_id    uuid,
  full_name  text,
  avatar_url text,
  role       text,
  joined_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    om.user_id,
    p.full_name,
    p.avatar_url,
    om.role,
    om.joined_at
  from organization_members om
  join profiles p on p.id = om.user_id
  where om.org_id = target_org
    and is_org_member(target_org)  -- caller must themselves belong to this org
  order by om.joined_at asc;
$$;

comment on function org_members_directory(uuid) is
  'Doc 06 §6.9 — returns the member roster (name, role) for an org the caller belongs to, bypassing profiles RLS via security definer since that policy only allows self-reads.';

grant execute on function org_members_directory(uuid) to authenticated;

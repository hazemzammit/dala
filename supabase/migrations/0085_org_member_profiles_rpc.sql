-- =============================================================================
-- 0085_org_member_profiles_rpc.sql
-- Audit findings 1a-1d — profiles_select_own (0005) is `id = auth.uid()`
-- only, so every screen that batches profile names/avatars for OTHER org
-- members (team/roles list, attendance history, activity feed) has been
-- silently getting zero rows back from PostgREST (no error) and masking
-- it with a fallback string ("Membre", "Non renseigné", "Quelqu'un").
--
-- get_profile_summary_for_org_member (0075) already solved this for a
-- single profile at a time. This is the batched sibling those four call
-- sites actually need — same access-control shape, reusing the existing
-- is_org_member() helper (0005/0039) rather than re-deriving membership
-- logic.
-- =============================================================================

create or replace function get_org_member_profiles(p_org_id uuid)
returns table (id uuid, full_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_org_member(p_org_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url
  from profiles p
  join organization_members om on om.user_id = p.id
  where om.org_id = p_org_id;
end;
$$;

comment on function get_org_member_profiles(uuid) is
  'Batched sibling of get_profile_summary_for_org_member (0075) — resolves
   the same profiles_select_own (0005) RLS gap for screens that need many
   members'' names/avatars at once (team/roles list, attendance history,
   activity feed), instead of one profile at a time. Caller must be a
   member of p_org_id (is_org_member), same as every other org-scoped
   read in this schema.';

grant execute on function get_org_member_profiles(uuid) to authenticated;

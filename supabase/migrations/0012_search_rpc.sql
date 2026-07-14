-- =============================================================================
-- 0012_search_rpc.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.12
-- One RPC, called identically by the web top bar (Doc 04 §4.2.1) and the
-- mobile Projects-list search bar (Doc 03 §3.10.1) — search behavior is
-- identical on both platforms by construction, not by coincidence.
-- =============================================================================

create or replace function search_all(p_query text, p_org_id uuid)
returns table (
  entity_type text,
  id uuid,
  label text,
  rank real
) language sql stable security invoker as $$
  select 'project', p.id, p.name, ts_rank(p.search_vector, websearch_to_tsquery('french', p_query)) as rank
  from projects p
  where p.lead_org_id = p_org_id
    and p.search_vector @@ websearch_to_tsquery('french', p_query)

  union all

  select 'worker', w.id, w.full_name, ts_rank(w.search_vector, websearch_to_tsquery('french', p_query))
  from workers w
  where w.org_id = p_org_id
    and w.search_vector @@ websearch_to_tsquery('french', p_query)

  union all

  select 'vehicle', v.id, v.name, ts_rank(v.search_vector, websearch_to_tsquery('french', p_query))
  from vehicles v
  where v.org_id = p_org_id
    and v.search_vector @@ websearch_to_tsquery('french', p_query)

  order by rank desc
  limit 20;
$$;

comment on function search_all(text, uuid) is
  'security invoker (not definer): runs with the calling client''s own RLS, so a caller can never search another org''s data by passing an arbitrary p_org_id.';

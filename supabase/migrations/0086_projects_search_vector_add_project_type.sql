-- =============================================================================
-- 0086_projects_search_vector_add_project_type.sql
-- Audit finding 4 — projects.search_vector (0006) was only ever generated
-- from name/client_name/address. project_type (0028) was added later and
-- never folded in, so search_all() (0012) — the single global-search RPC
-- used identically by web's top bar and mobile's projects-list search —
-- never surfaces a project by its type (e.g. "résidentiel", "industriel").
-- 0075 already fixed the identical situation for workers.search_vector
-- (adding job_title); this applies the exact same drop+recreate pattern
-- to projects, generated columns can't be ALTER'd in place.
--
-- BUG FOUND WHILE APPLYING THIS MIGRATION (fixed here, not deferred,
-- same as 0075's own note for active_workers): active_projects (0013,
-- `select * from projects where deleted_at is null`) depends on every
-- column of projects including search_vector, so `drop column
-- search_vector` fails with "cannot drop column search_vector ... other
-- objects depend on it" (view active_projects) unless the view is
-- dropped first. A plain `select *` view has no stored reference to a
-- specific column's contents, so it's safe to drop and recreate
-- identically around the column swap — same definition, and the
-- security_invoker flag 0037 added restored immediately after (dropping
-- the view does not carry that setting back in automatically).
-- =============================================================================

drop view if exists active_projects;

alter table projects add column search_vector_v2 tsvector
  generated always as (
    to_tsvector('french',
      coalesce(name, '') || ' ' || coalesce(client_name, '') || ' ' ||
      coalesce(address, '') || ' ' || coalesce(project_type, '')
    )
  ) stored;

drop index if exists projects_search_idx;
create index projects_search_idx on projects using gin (search_vector_v2);

alter table projects drop column search_vector;
alter table projects rename column search_vector_v2 to search_vector;

-- Recreate active_projects exactly as 0013 defined it, with the
-- security_invoker flag 0037 added — see this migration's header for why
-- dropping the view required this to be restored explicitly rather than
-- silently regressing the RLS fix 0037 shipped.
create or replace view active_projects as
  select * from projects where deleted_at is null;

alter view active_projects set (security_invoker = true);

comment on view active_projects is
  'Doc 01 §1.16 — projects excluding soft-deleted rows. security_invoker = true '
  '(added 0037) so RLS is enforced against the querying user, not the view '
  'owner — see 0037''s header for why this mattered and what it fixed.';

-- search_all() (0012) queries projects.search_vector by name only and
-- needs no change — the column name is unchanged, only its generated
-- expression is wider now.

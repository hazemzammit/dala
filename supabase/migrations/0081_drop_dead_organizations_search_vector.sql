-- =============================================================================
-- 0081_drop_dead_organizations_search_vector.sql
--
-- organizations.search_vector + organizations_search_idx (0003) have never
-- been read by anything, ever. Confirmed by grepping every migration and
-- the entire mobile app for `organizations.*search_vector` or
-- `organizations_search_idx` outside the two lines in 0003 that create
-- them — zero hits. search_all() (0012), the only full-text search RPC
-- this schema has, only searches projects/workers/vehicles — and by
-- construction (scoped to a single p_org_id, searching THAT org's
-- sub-resources) an "organizations" arm doesn't actually fit it: an org
-- searching for itself by name isn't a feature, and a real cross-org
-- directory search (e.g. finding a partner org to invite, using the
-- service_area/legal_form fields 0075 added) would be a genuinely
-- different, currently-unbuilt feature with its own UI and exposure
-- questions — not something to bolt on silently here.
--
-- Until that feature is actually designed, this column is pure dead
-- weight: Postgres recomputes and re-indexes it on every write to
-- `organizations` (name/trade_type edits, i.e. any org-settings save) for
-- zero read benefit today. Dropping both rather than leaving a longer-
-- lived unused index sitting on a frequently-updated table.
--
-- If/when a cross-org directory search is actually scoped, re-add it
-- fresh against the real requirements then (service_area, legal_form,
-- trade_type, name are all plausible fields — worth revisiting, not
-- guessing at here) rather than resurrecting this one as-is.

drop index if exists organizations_search_idx;
alter table organizations drop column if exists search_vector;

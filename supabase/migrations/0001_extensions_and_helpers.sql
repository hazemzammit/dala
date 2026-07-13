-- =============================================================================
-- 0001_extensions_and_helpers.sql
-- Extensions and generic helper functions used by every later migration.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy text search support

-- Generic trigger: keep `updated_at` current on every UPDATE.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Attach as a BEFORE UPDATE trigger on any table with an updated_at column.';

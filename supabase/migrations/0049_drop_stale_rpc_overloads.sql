-- =============================================================================
-- 0049_drop_stale_rpc_overloads.sql
-- Ref: test:rls failures on createAdvance.test.ts / pushChanges.test.ts,
-- first live run against a real Supabase instance (Priority 0.2).
--
-- Root cause: migrations 0047 and 0048 each added a new trailing optional
-- parameter to create_advance / request_advance / submit_site_log_entry
-- using `create or replace function`. In Postgres, `create or replace`
-- only replaces a function with the IDENTICAL parameter list — a new
-- trailing parameter changes the signature, so it creates an ADDITIONAL
-- overload rather than replacing the old one. Neither 0047 nor 0048 ever
-- dropped the overload it superseded, so each of these 3 functions now
-- has 3 live overloads simultaneously (5/6/7-arg for create_advance,
-- 3/4/5-arg for request_advance, 8/9/11-arg for submit_site_log_entry).
--
-- PostgREST resolves an RPC call by matching the JSON body's named keys
-- against candidate signatures. A call that supplies only the original
-- required params (no p_id/p_created_at/p_caption) matches ALL THREE
-- overloads equally well — Postgres can't rank "fewer trailing defaults"
-- as better, so it raises PGRST203 ("Could not choose the best candidate
-- function") instead of silently picking one. This is exactly what every
-- failing test above hit; it is not a data or RLS bug.
--
-- Fix: drop the two superseded overloads for each function, leaving only
-- the current 0048 signature (which already has p_id/p_created_at/
-- p_caption as optional trailing params, so every existing call site —
-- including ones that never pass those three — keeps working unchanged
-- against the single remaining signature).
-- =============================================================================

-- create_advance: drop 5-arg (0019) and 6-arg (0047); keep 7-arg (0048)
drop function if exists create_advance(uuid, uuid, numeric, text, uuid);
drop function if exists create_advance(uuid, uuid, numeric, text, uuid, uuid);

-- request_advance: drop 3-arg (0019) and 4-arg (0047); keep 5-arg (0048)
drop function if exists request_advance(numeric, text, uuid);
drop function if exists request_advance(numeric, text, uuid, uuid);

-- submit_site_log_entry: drop 8-arg (0020) and 9-arg (0047); keep 11-arg (0048)
drop function if exists submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid);
drop function if exists submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid);

-- Sanity check (run manually after applying): each of these should return
-- exactly ONE row.
--
-- select proname, pronargs from pg_proc
-- where proname in ('create_advance', 'request_advance', 'submit_site_log_entry')
-- group by proname, pronargs;

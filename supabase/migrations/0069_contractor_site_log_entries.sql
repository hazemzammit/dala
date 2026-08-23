-- =============================================================================
-- Phase 2 (improvement-plan §11 "Wiring pass", §1.2 step 1 — "let the
-- contractor add entries") — BUG FOUND WHILE IMPLEMENTING, fixed here rather
-- than shipping a feature that silently never syncs.
--
-- `submit_site_log_entry()` (0008, reshaped by 0020/0041/0047/0048) is the
-- ONLY write path for `site_logs` — `pushChanges.ts`'s `pushSiteLogs()`
-- always calls this RPC, never a plain insert (site_logs is append-only,
-- Doc 01 §1.9). Its very first check is:
--
--   select * into v_worker from workers where user_id = auth.uid();
--   if not found then raise exception 'no_worker_record_for_current_user'; end if;
--
-- That's correct for the screen this RPC was built for (Doc 03 §4.2, the
-- WORKER's own update-chantier.tsx) — but a contractor/org-owner has no row
-- in `workers` (that table is field workers, not the org owner themselves;
-- confirmed by reading workers' own RLS/foreign-key shape before writing
-- this). Wiring a contractor-facing FAB onto `journal.tsx` on top of this
-- RPC unchanged would not have failed loudly or obviously — the local
-- WatermelonDB write in the shared `SiteLogForm` component always succeeds
-- (it's a plain local insert), so the contractor sees "Entrée ajoutée" and
-- the entry appears in their own list immediately from local state. The
-- exception only surfaces later, inside `runSync()`'s background push, as a
-- console.error the contractor never sees — the entry would never reach the
-- server, never reach another device, and (per pushSiteLogs' own
-- fail-loud-not-silent design for this exact table) block every subsequent
-- table's push in that sync cycle behind it.
--
-- This is a small, targeted permission-check widening — not the "build a
-- new module" scale of a later-phase item — so it's fixed here rather than
-- flagged-and-deferred, same reasoning Phase 1 used for its `runSync()`
-- fix and the same size/shape as Phase 16's original 0039/0040 RLS fixes.
-- The exact 11-arg signature is UNCHANGED (no new overload, no new
-- parameter) — only the body's org-resolution logic changes, so every
-- existing caller (update-chantier.tsx, the idempotency test suite)
-- resolves identically to before when the caller IS a worker.
--
-- New behavior, additive: when the caller has no `workers` row, fall back
-- to checking `org_role_of()` against the TARGET PROJECT's `lead_org_id`
-- (owner/manager only — a read-only "viewer" role still cannot write here,
-- consistent with every other owner/manager-gated write in this schema,
-- e.g. `create_advance` above in this same file's own migration series).
-- `logged_by` was already `auth.uid()` directly (not `v_worker.id`), so
-- that column needed no change — `journal.tsx`'s own `loggedByName()`
-- already falls back to "Contractant" for a `logged_by` that doesn't
-- resolve in the workers-by-user_id map, which is exactly correct for this
-- new caller.
-- =============================================================================

create or replace function submit_site_log_entry(
  p_project_id uuid,
  p_photo_url text,
  p_voice_note_url text,
  p_note_text text,
  p_thumbnail_url text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_idempotency_key uuid,
  p_id uuid default null,
  p_created_at timestamptz default null,
  p_caption text default null
)
returns site_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker workers;
  v_org_id uuid;
  v_hash_subject text;
  v_request_hash text;
  v_existing idempotency_keys;
  v_log site_logs;
begin
  select * into v_worker from workers where user_id = auth.uid();

  if found then
    v_org_id := v_worker.org_id;
    v_hash_subject := v_worker.id::text;
  else
    -- Not a worker — allow the project's owning org's owner/manager
    -- (the contractor add-entry path, Phase 2) to log an entry on their
    -- own project. Falls through to the original exception if neither
    -- condition holds, so a viewer, an unrelated org's member, or an
    -- unauthenticated caller is rejected exactly as before.
    select p.lead_org_id into v_org_id from projects p where p.id = p_project_id;

    if v_org_id is null or org_role_of(v_org_id) not in ('owner', 'manager') then
      raise exception 'no_worker_record_for_current_user';
    end if;

    v_hash_subject := auth.uid()::text;
  end if;

  if p_photo_url is null and p_voice_note_url is null and (p_note_text is null or length(trim(p_note_text)) = 0) then
    raise exception 'at_least_one_field_required';
  end if;

  if not exists (select 1 from projects where id = p_project_id and lead_org_id = v_org_id) then
    raise exception 'project_not_in_worker_org';
  end if;

  v_request_hash := md5(
    coalesce(v_hash_subject, '') || '|' ||
    coalesce(p_project_id::text, '') || '|' ||
    coalesce(p_photo_url, '') || '|' ||
    coalesce(p_voice_note_url, '') || '|' ||
    coalesce(p_note_text, '')
  );

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_log from site_logs where id = (v_existing.response_body ->> 'id')::uuid;
    return v_log;
  end if;

  insert into site_logs (
    id, org_id, project_id, photo_url, voice_note_url, note_text, thumbnail_url,
    location_lat, location_lng, logged_by, idempotency_key, caption, created_at
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_org_id, p_project_id, p_photo_url, p_voice_note_url, p_note_text, p_thumbnail_url,
    p_location_lat, p_location_lng, auth.uid(), p_idempotency_key, p_caption, coalesce(p_created_at, now())
  )
  returning * into v_log;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_org_id, 'submit_site_log_entry', v_request_hash, 200, jsonb_build_object('id', v_log.id));

  return v_log;
end;
$$;

-- Signature is byte-for-byte unchanged from 0048, so the existing
-- revoke/grant pair already covers this redefinition — re-stated here only
-- so this file is a complete, self-contained record of this function's
-- current access, matching every other migration's own convention.
revoke execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) from public;
grant execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) to authenticated;

comment on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid, uuid, timestamptz, text) is
  'Doc 03 §4.2 — worker site log submission, extended by improvement-plan Phase 2 (0069) to also accept the project''s owning org''s owner/manager (the contractor add-entry path, journal.tsx) — a caller with no workers row is checked against org_role_of(projects.lead_org_id) instead of being unconditionally rejected. p_id (0047): optional client-supplied row id for the WatermelonDB offline-first push path. p_created_at / p_caption (0048): optional client-supplied creation timestamp and photo caption.';

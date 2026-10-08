-- =============================================================================
-- 0101_storage_hardening.sql
--
-- Audit findings (storage): path injection through the collaboration graph,
-- and an unrestricted `org-files` bucket.
--
-- 1. PATH INJECTION. org_files_select_shared_project_member grants read access
--    to any object referenced by ANY site_logs row in a project the caller
--    belongs to (is_shared_site_log_file). Nothing tied the row's org to the
--    file's org, so an attacker could: create their own org + project, add
--    their own org to it, insert a site_log whose photo_url is ANOTHER org's
--    storage path (`{orgId}/{category}/{uuid}.ext` — the uuid is unguessable,
--    but leaks through exports, old shares, logs, support tickets) and read it.
--    Reproduced live. Fixed twice over:
--      a. is_shared_site_log_file() now also requires the log's org_id to equal
--         the path's first folder — a file can only be "shared" by the org that
--         actually owns it.
--      b. site_logs gets a CHECK that its file paths live under its own org
--         (NOT VALID: enforced for every new/changed row, legacy rows are not
--         re-checked; run VALIDATE CONSTRAINT after cleaning).
--    Legitimate flows are unchanged: logs are created by the project's lead
--    org (submit_site_log_entry stamps org_id = lead org) with files uploaded
--    under that same org's folder.
--
-- 2. BUCKET LIMITS. org-files had no size cap and no content-type allowlist:
--    members could store .exe/.html/.svg. Now capped at 10 MiB (matches
--    supabase/config.toml) and limited to the types the apps really upload:
--    JPEG/PNG/WebP/HEIC/HEIF images, PDF, and m4a/mp4/aac/mpeg audio. SVG and
--    HTML are deliberately excluded (script-carrying). NOTE this is
--    defence-in-depth: Storage checks the DECLARED content type, so it stops
--    accidents and casual abuse, not a client that lies about it.
--
-- 3. UPLOADS. The insert policy allowed any org participant — including
--    read-only viewers — to write files into the org folder. Viewers are now
--    excluded (workers, who have no membership row, and members with a write
--    role are unchanged).
-- =============================================================================

-- 1a. -------------------------------------------------------------------------
create or replace function public.is_shared_site_log_file(p_path text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from site_logs
    where (photo_url = p_path or voice_note_url = p_path or thumbnail_url = p_path)
      and org_id::text = split_part(p_path, '/', 1)
      and is_project_member(project_id)
  );
$$;

-- 1b. -------------------------------------------------------------------------
alter table public.site_logs
  add constraint site_logs_file_paths_in_own_org check (
    (photo_url is null or split_part(photo_url, '/', 1) = org_id::text)
    and (voice_note_url is null or split_part(voice_note_url, '/', 1) = org_id::text)
    and (thumbnail_url is null or split_part(thumbnail_url, '/', 1) = org_id::text)
  ) not valid;

-- 2. --------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
         'application/pdf',
         'audio/m4a', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg'
       ]
 where id = 'org-files';

-- 3. --------------------------------------------------------------------------
drop policy if exists org_files_insert_participant on storage.objects;
create policy org_files_insert_participant on storage.objects
  for insert
  with check (
    bucket_id = 'org-files'
    and public.is_org_participant(((storage.foldername(name))[1])::uuid)
    and coalesce(public.org_role_of(((storage.foldername(name))[1])::uuid), 'none') <> 'viewer'
  );

-- =============================================================================
-- 0017_site_logs_storage.sql
-- Ref: docs/spec/06-besoins-fonctionnels.md §6.2 (journal de chantier)
-- Ref: Doc 07 §7.2 — file access via signed URLs only, storage partitioned
-- by organization.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('site-logs', 'site-logs', false)
on conflict (id) do nothing;

create policy "site_logs_storage_select_member"
  on storage.objects for select
  using (
    bucket_id = 'site-logs'
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

create policy "site_logs_storage_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'site-logs'
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

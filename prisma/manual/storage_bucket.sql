-- Storage setup for document upload (/api/files). Run ONCE against your
-- Supabase Postgres (Supabase Studio → SQL editor, or:
--   npx prisma db execute --file prisma/manual/storage_bucket.sql
-- ). Idempotent / safe to re-run.

-- 1. The bucket the API uploads proposal documents into.
insert into storage.buckets (id, name, public)
values ('proposal-files', 'proposal-files', true)
on conflict (id) do nothing;

-- 2. The app talks to Storage with the anon key, so anon needs object access
--    scoped to this bucket. (If you later move to a service-role key
--    server-side, these policies can be dropped.)
drop policy if exists "proposal-files anon read" on storage.objects;
create policy "proposal-files anon read" on storage.objects
  for select to anon using (bucket_id = 'proposal-files');

drop policy if exists "proposal-files anon insert" on storage.objects;
create policy "proposal-files anon insert" on storage.objects
  for insert to anon with check (bucket_id = 'proposal-files');

drop policy if exists "proposal-files anon delete" on storage.objects;
create policy "proposal-files anon delete" on storage.objects
  for delete to anon using (bucket_id = 'proposal-files');

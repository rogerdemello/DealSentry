-- Lock the database down with Row Level Security.
--
-- WHY: Supabase exposes every table in the `public` schema over a REST API that
-- anyone holding the project's anon key can call. With RLS off, that key alone
-- can read the whole "User" table (password hashes) and "Integration" table (CRM
-- OAuth tokens) and write to any table. The anon key is designed to be public, so
-- it must not be what protects the data.
--
-- HOW IT WORKS: enabling RLS with NO policies denies the `anon` and
-- `authenticated` roles everything. The API is unaffected only because it talks to
-- Supabase with the SERVICE-ROLE key, which bypasses RLS.
--
-- !! BEFORE YOU RUN THIS !!
--   1. Supabase Dashboard → Project Settings → API → copy the `service_role` key.
--   2. Set it as SUPABASE_SERVICE_ROLE_KEY in your local .env AND in the Render
--      dashboard (Environment). Server-side only — never in a VITE_ variable.
--   3. Redeploy / restart the API so it picks the key up.
--   4. npm run check:rls          (must print "ready")
--   If you skip this, the API loses access to its own database the moment this runs.
--
-- RUN:  npx prisma db execute --file prisma/manual/enable_rls.sql
-- THEN: npm run check:rls -- --verify   (confirms the anon key is now locked out)
--
-- Idempotent / safe to re-run. To undo, `alter table "<name>" disable row level security;`

alter table "User"        enable row level security;
alter table "Proposal"    enable row level security;
alter table "RiskReport"  enable row level security;
alter table "AuditLog"    enable row level security;
alter table "Rule"        enable row level security;
alter table "LegalClause" enable row level security;
alter table "Template"    enable row level security;
alter table "Integration" enable row level security;
alter table "SyncLog"     enable row level security;

-- Semantic search RPC: only the API (service role) may call it.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'match_proposals') then
    revoke execute on function match_proposals(vector, integer, text) from public, anon, authenticated;
    grant execute on function match_proposals(vector, integer, text) to service_role;
  end if;
end $$;

-- Storage: the API now reaches the bucket with the service role too, so the anon
-- read/insert/delete policies from storage_bucket.sql are no longer needed, and
-- the bucket no longer has to be public (uploads return signed links).
drop policy if exists "proposal-files anon read"   on storage.objects;
drop policy if exists "proposal-files anon insert" on storage.objects;
drop policy if exists "proposal-files anon delete" on storage.objects;
update storage.buckets set public = false where id = 'proposal-files';

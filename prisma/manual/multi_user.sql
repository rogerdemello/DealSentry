-- Multi-user support (AUTH_MODE=login). Run ONCE against your Supabase Postgres
-- (Supabase Studio → SQL editor, or:
--   npx prisma db execute --file prisma/manual/multi_user.sql
-- ). Idempotent / safe to re-run. Not needed for the default single-user demo mode.

-- 1. Which company a user belongs to. The API already reads this column when it
--    exists (users without it simply have no company), and POST/PATCH /api/users
--    writes it. Proposal.company_id is added by semantic_search.sql.
alter table "User" add column if not exists company_id text;
alter table "Proposal" add column if not exists company_id text;

-- 2. Indexes for the lookups the API makes on every list/search request.
create index if not exists user_company_idx on "User" (company_id);
create index if not exists proposal_company_idx on "Proposal" (company_id);
create index if not exists proposal_user_idx on "Proposal" ("userId");
create index if not exists integration_user_idx on "Integration" ("userId");

-- 3. Emails are matched case-insensitively at sign-in and registration, so make the
--    database agree: no two accounts that differ only by letter case. Skipped (with
--    a notice) if such duplicates already exist — merge them first, then re-run.
do $$
begin
  if exists (select 1 from "User" group by lower(email) having count(*) > 1) then
    raise notice 'Skipping unique lower(email) index: users that differ only by case exist. Merge them and re-run.';
  else
    create unique index if not exists user_email_lower_idx on "User" (lower(email));
  end if;
end $$;

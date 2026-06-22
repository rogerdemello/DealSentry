# Deployment Guide

DealSentry ships as a single Node service: the Express API also serves the
built React SPA (on `NODE_ENV=production`). It depends on a Supabase project
(Postgres + storage) and Azure OpenAI.

## 1. Prerequisites

- A Supabase project (database + a `proposal-files` storage bucket).
- An Azure OpenAI deployment (e.g. `gpt-4o`).
- Node 20+ (for non-container runs) or Docker.

## 2. Configure environment

Copy the template and fill in real values:

```bash
cp .env.example .env
```

Key variables (see `.env.example` for the full list):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres connection string (used by Prisma migrations) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase REST/storage client |
| `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | AI generation & analysis |
| `NEXTAUTH_SECRET` | JWT signing secret — generate a fresh 32+ byte value |
| `API_PORT` | Server port (default `3001`) |
| `PRODUCTION_URL` | Allowed CORS origin in production |

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

> Security: `.env` is gitignored and must never be committed. Rotate any
> credential that has been shared in plaintext (DB password, Azure key,
> `NEXTAUTH_SECRET`).

## 3. Apply database schema

```bash
npx prisma generate
npx prisma migrate deploy
npm run seed   # optional: demo users, rules, templates, sample proposals
```

## 4a. Run with Docker (recommended)

```bash
docker compose up --build
```

This builds the SPA, installs system Chromium (for PDF export), and serves the
app on `http://localhost:3001`. Configuration is read from `.env`.

## 4b. Run with Node directly

```bash
npm ci
npm run build          # builds the SPA into dist/
NODE_ENV=production npx tsx server.ts
```

The server serves the API under `/api/*` and the SPA for all other paths.

## 5. Verify

```bash
curl -s http://localhost:3001/api/health     # -> {"status":"ok",...}
```

Then open `http://localhost:3001`, log in (seeded `admin@dealsentry.ai`),
create a proposal, run analysis, and export a PDF — the PDF path exercises the
containerized Chromium, confirming the image is complete.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: install →
`prisma generate` → lint → typecheck → test → build. Keep it green before
deploying.

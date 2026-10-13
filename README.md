# DealSentry

DealSentry is an AI-assisted proposal compliance and risk review system for sales teams, compliance managers, and operations leaders. It helps teams create, upload, analyze, and approve business proposals while checking pricing, legal, and structural requirements before a deal moves forward.

## Problem

Proposal reviews are often slow, inconsistent, and spread across too many tools. Teams have to check discounting, missing clauses, approval thresholds, and document quality by hand, which creates delays and increases the chance of risky proposals going out unchecked.

## Approach

The application combines a React frontend, an Express and TypeScript API, Prisma, and PostgreSQL to manage proposals end to end. Uploaded or created proposals are analyzed against compliance rules, scored for risk, and routed through review workflows so users can see issues early and act on them quickly.

Core capabilities include proposal creation, document upload, AI-assisted analysis, approval routing, audit logging, and enterprise integrations such as Salesforce, HubSpot, Gmail, and Google Drive.

## Iterations

The project evolved in stages:

1. Built the core proposal management flow so users could create, store, and review proposals.
2. Added compliance rules and risk scoring to catch pricing, legal, and structural issues.
3. Expanded the workflow with uploads, approvals, audit logs, and role-based access control.
4. Added integrations and stability improvements so the system can fit into a real sales operations stack.

## Key Design Choices

The main design choices were made to keep the system practical for enterprise use:

- A clear separation between frontend, API, and database logic keeps the codebase easier to maintain.
- Prisma is used for schema-driven data access and safer database operations.
- Role-based access control limits what each user can see and do.
- Automated analysis and scoring reduce manual review time and make risk visible earlier.
- Responsive UI patterns and reusable components keep the interface consistent across proposal, compliance, and admin screens.
- Integration support is built in from the start so the system can connect to external business tools without major redesign.

## Daily Time Commitment

Typical development time was about 2 to 4 focused hours per day during active implementation. That pace was enough to make steady progress on UI, backend routes, compliance logic, and integration work without sacrificing review and testing time.

## Setup

### Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer, or a Supabase project
- npm

### Install

```bash
npm install
npx prisma generate
npx prisma db push          # sync the schema (this repo has no migration files)
npm run seed
```

Copy `.env.example` to `.env` and fill it in (Supabase URL/key, and an AI provider — see below).

Then apply the one-time manual SQL (idempotent, safe to re-run):

```bash
# pgvector + semantic search function (required for proposal search)
npx prisma db execute --file prisma/manual/semantic_search.sql
npm run backfill:embeddings

# Storage bucket (only needed if you use the /api/files upload endpoints)
npx prisma db execute --file prisma/manual/storage_bucket.sql
```

### Run

```bash
npm run dev:full
```

On Windows, you can also use `start.bat` to launch the backend and frontend together.

## Configuration

### AI provider

Set **one** of these in `.env`:

| Provider | Variables |
| --- | --- |
| Google Gemini (checked first) | `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-2.5-flash`) |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT`, `OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` |

With **no** provider configured, or when the provider is unreachable or returns an unusable answer,
**analysis still works**: it falls back to a built-in rule checker (discount cap, minimum deal size,
payment terms, required clauses, document structure) and the report says so. Set `ANALYSIS_MODE=rules`
to force the rule checker. Proposal *generation* needs an AI provider and reports `AI_UNAVAILABLE` without one.

Semantic search uses embeddings from the same provider (Gemini `gemini-embedding-001`, or the Azure
embedding deployment). After switching provider, re-embed everything:
`npm run backfill:embeddings -- --all`.

### Authentication

| `AUTH_MODE` | Behaviour |
| --- | --- |
| `demo` (default) | No sign-in. Every visitor is the default user (`DEMO_USER_EMAIL`, else the first admin). Ideal for demos. |
| `login` | Real multi-user mode. Every route needs a token; people sign in with email and password; data is isolated per company (or per owner for users without a company). |

Going multi-user:

1. Set `AUTH_MODE=login` and a long random `NEXTAUTH_SECRET` (the server refuses to start without one).
2. `npx prisma db execute --file prisma/manual/multi_user.sql` (adds `User.company_id` and indexes).
3. `npm run set-passwords` — issues each user a random password, shown once. Admins can create users with a
   password and company through `POST /api/users`; set `ALLOW_SELF_REGISTRATION=true` to let people sign up.

### Hardening the database

Row Level Security is **off** by default, which means the public Supabase anon key can read every table.
To lock it down, follow the steps at the top of `prisma/manual/enable_rls.sql` (set `SUPABASE_SERVICE_ROLE_KEY`
first, then `npm run check:rls`, run the SQL, and `npm run check:rls -- --verify`).

## Testing

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs the same four steps on every push and pull request.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and trade-offs
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — rehearsed demo storyline
- [SETUP.md](SETUP.md)
- [COMPLIANCE_RULES.md](COMPLIANCE_RULES.md)
- [docs/SERVER_STABILITY.md](docs/SERVER_STABILITY.md)
- [docs/AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)
- [docs/SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)

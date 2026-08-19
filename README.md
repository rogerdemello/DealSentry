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

- Node.js 18 or newer
- PostgreSQL 14 or newer, or a Supabase project
- npm

### Install

```bash
npm install
npx prisma generate
npx prisma db push          # sync the schema (this repo has no migration files)
npm run seed
```

Then apply the one-time manual SQL (idempotent, safe to re-run):

```bash
# pgvector + semantic search function (required for proposal search)
npx prisma db execute --file prisma/manual/semantic_search.sql
npm run backfill:embeddings

# Storage bucket + policies (required for document upload)
npx prisma db execute --file prisma/manual/storage_bucket.sql
```

### Run

```bash
npm run dev:full
```

On Windows, you can also use `start.bat` to launch the backend and frontend together.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design and trade-offs
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — rehearsed demo storyline
- [SETUP.md](SETUP.md)
- [COMPLIANCE_RULES.md](COMPLIANCE_RULES.md)
- [docs/SERVER_STABILITY.md](docs/SERVER_STABILITY.md)
- [docs/AUTH_QUICKSTART.md](docs/AUTH_QUICKSTART.md)
- [docs/SALESFORCE_INTEGRATION.md](docs/SALESFORCE_INTEGRATION.md)

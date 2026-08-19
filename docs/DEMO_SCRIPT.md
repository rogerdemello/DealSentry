# DealSentry — 7-minute demo script

A rehearsed storyline that shows every major capability without dead ends.
Practice it twice before presenting; every step below is verified working.

> **Before the demo (2 min):** open the deployed URL once to wake the Render
> free-tier instance (cold start ≈ 30s), and keep a second tab on the
> Dashboard. Locally: `npm run dev:full`, then http://localhost:8080.

## 1. The problem (30s)

"Sales teams send out proposals with pricing and legal problems — discounts
nobody approved, missing indemnification clauses, 120-day payment terms.
DealSentry catches these before the proposal leaves the building."

## 2. Dashboard tour (30s)

- Point at the analytics: status breakdown, average readiness score,
  needs-attention count — all computed from live data.

## 3. AI generation (90s) — *the wow moment*

- New Proposal → AI generate, type:
  *"Proposal for TechNova Inc, $75,000 data platform modernization, 10%
  discount, net 60 payment, healthcare industry"*
- Show the generated document: full sections, all five mandatory legal
  clauses. Point out that the generator **enforces** policy (caps discounts at
  25%, payment terms at 90 days) — AI with guardrails, not instead of them.

## 4. Catching a risky proposal (2 min) — *the core story*

- Upload `sample_proposal/` docx (or create one) with deliberate violations:
  35% discount, Net 120 payment terms, no legal clauses.
- Run analysis → walk through the risk report:
  - **CRITICAL — Discount violation** (35% > 25% policy)
  - **HIGH — Payment terms** (120 > 90 days)
  - **HIGH — Missing legal clauses**
  - Readiness score + legal/pricing/structural risk breakdown.
- Show the AI recommendations, then **Reject** it. Open the Audit page —
  every action is logged with actor and before/after.

## 5. Semantic search (45s)

- Search "cloud migration" — results rank by *meaning* (pgvector cosine
  similarity over Azure OpenAI embeddings), not keywords. Mention the graceful
  fallback to substring search when embeddings are unavailable.

## 6. CRM integration (45s)

- Integrations → Connect Salesforce (demo mode) → Sync.
- Three deals import as proposals instantly; each can now be analyzed.
  Mention: real mode is the same OAuth flow with token refresh.

## 7. Boardroom-ready output (30s)

- Open an analyzed proposal → Export PDF. Show the cover page, compliance
  appendix with the quality scores, and page numbering. (Headless Chrome
  server-side.)

## 8. Close (30s)

"React + Express + Supabase + Azure OpenAI, deployed on Render from a Docker
blueprint, CI-tested, with policy enforced in code and AI explaining the why.
Everything you saw is in the repo — including the architecture doc."

## Q&A cheat sheet

- **Why no login?** Demo mode by design; the JWT/bcrypt stack is live and
  honored when a token is present (`docs/AUTH_QUICKSTART.md`).
- **What stops the AI hallucinating compliance?** Deterministic re-checks in
  code: discounts clamped, thresholds hardcoded, findings normalized.
- **How would you scale it?** Enable RLS + service-role key (already
  supported), move PDF export to a worker, add Redis for rate limits.
- **Weakest point?** Schema drift between Prisma schema and the live DB —
  known, documented in ARCHITECTURE.md, and contained because runtime access
  goes through PostgREST.

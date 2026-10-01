# Fieldpoint

AI-assisted federal contracting **research, analysis, sourcing and pipeline** for a small business pursuing U.S. government (mostly DoD) work.

`government opportunity → SAM.gov / DIBBS → database → classification & filters → AI Pursuit Brief → document analysis → "Can we bid this?" checklist → sourcing & pricing → pipeline`

Fieldpoint **never submits bids, never contacts government staff, and never represents your company**. It never asks for a SAM.gov password. Missing data shows as **Unknown**. Every AI statement is labelled **Verified from solicitation** (machine-checked citation), **AI analysis**, or **Needs verification**. UNKNOWN never becomes PASS — only you can set PASS. See the spec's principles in `lib/ai/prompts.ts` (included verbatim in every AI call).

## Stack

Next.js 16 (App Router, TypeScript strict) · Tailwind v4 driven by design tokens (`lib/design/tokens.ts`) · Radix primitives · TanStack Table/Query/Virtual · dnd-kit · React Hook Form + Zod · Supabase (Postgres, Auth, RLS, Storage) · Anthropic Claude (server-side, structured outputs, prompt caching) · pdf.js / mammoth / SheetJS · Resend · Vitest + Playwright.

## Setup

```bash
npm install
cp .env.example .env.local        # fill in the values below
```

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | same page. **Server-only**; bypasses RLS. |
| `SAM_API_KEY` | **SAM.gov → Account Details → request a public API key.** Server-only. Fieldpoint never asks for your SAM password. |
| `SAM_DAILY_QUOTA` | Calls/day your key allows. The docs don't state the number; default **10** (conservative for non-federal keys). **Raise it here** if your SAM account role grants more (e.g. `SAM_DAILY_QUOTA=1000`). |
| `SAM_RESERVED_CALLS` | Calls held back per day for on-demand description/attachment fetches (default 2). |
| `ANTHROPIC_API_KEY` | console.anthropic.com. Server-only. |
| `AI_MODEL_BRIEF` / `AI_MODEL_EXTRACT` / `AI_MODEL_SEARCH` | Model names live in config (default `claude-opus-5-5`). `AI_EFFORT` (default `high`), `AI_REFUSAL_FALLBACK` (`on`). |
| `CRON_SECRET` | `openssl rand -hex 32`. Cron routes require it. |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com (alert digests; optional per user). |
| `APP_URL` | Public URL, used in email links. |

All variables are validated with Zod at startup (`instrumentation.ts` → `lib/env.ts`); a missing one fails loudly. A build check (`scripts/check-secrets.ts`, run after `next build`) fails if any secret value, service-role JWT, or server-only import can reach client code.

### Database

Migrations are plain SQL in `supabase/migrations` (schema → triggers/classification → **RLS on every table** → storage → search).

```bash
# Supabase CLI
supabase link --project-ref <ref>
supabase db push
# …or paste each file, in order, into the SQL editor.
```

The `documents` Storage bucket is created private by `0004_storage.sql`; there are intentionally **no** client storage policies — files are only reachable through short-lived signed URLs minted server-side after an RLS-checked read.

Then sign in, create your company (first user becomes **Owner**), complete onboarding (company basics → NAICS & capabilities → connection status → first sync). Invite teammates from Settings (Owner / Member / Viewer).

### Cron

`vercel.json` schedules both jobs (Vercel sends `Authorization: Bearer $CRON_SECRET` automatically):

| Route | Schedule | Does |
|---|---|---|
| `/api/cron/sync-sam` | daily | Quota-aware SAM sync (per-NAICS calls if they fit the budget, else a windowed sweep filtered locally; resumable across days), then saved-search alerts |
| `/api/cron/alerts` | hourly | Deadline reminders (7/3/1 by default), quote-expiry warnings, saved-search matches, email (digest at 12:00 UTC), housekeeping |

Vercel **Hobby** only allows daily crons; hourly alert checks need **Pro**. On Hobby change the alerts schedule to daily. Alternatively call the routes from Supabase `pg_cron` + `pg_net` (`select net.http_post(url := '<app>/api/cron/alerts', headers := jsonb_build_object('Authorization','Bearer <CRON_SECRET>'))`) or any scheduler.

### Deploy to Vercel

1. Import the repo; framework preset *Next.js*.
2. Add every variable from `.env.example` (Production + Preview). Set `NEXT_PUBLIC_*` before the first build — they are inlined.
3. Deploy. Security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) come from `next.config.ts`.
4. AI analysis, extraction and attachment fetch can run for minutes; they set `maxDuration = 300` (Vercel Pro or Fluid compute).

## Day-to-day behaviour worth knowing

* **The UI never calls SAM.gov on page load.** Everything reads the database. SAM is called only by the cron job, **Settings → Sync now**, and the on-demand *Fetch from SAM.gov* button (description + attachments), and every call is counted against `SAM_DAILY_QUOTA`.
* SAM returns each notice's `description` as a **URL** (an extra call), so descriptions are fetched on demand. See `docs/DISCREPANCIES.md` for this and the other places the official docs differ from the spec.
* DIBBS has no public API. **Import DIBBS** accepts an RFQ PDF/TXT you downloaded or pasted text; nothing is scraped and no login is automated.
* AI spend is tracked per call (`ai_analyses`), shown in Settings with a monthly cap that blocks new analyses. Briefs regenerate only when you ask; if the notice or documents change, the brief is flagged *stale* instead of auto-spending.

## Testing

```bash
npm test                 # Vitest: unit + migrations/RLS against a local Postgres (scripts/test-db.sh start)
npm run typecheck && npx eslint .
npm run test:e2e         # Playwright against the local QA stack (below)
npm run qa:screens       # light/dark × desktop/tablet/mobile screenshots of every screen
```

**Local QA stack (no Docker or Supabase needed).** `scripts/qa.sh up` boots Postgres with the real migrations, a *Supabase-compatible shim* (auth + PostgREST subset + storage, `tests/qa/shim`), a fake SAM endpoint, a fake Anthropic endpoint, seeded fixtures, and the real Next app on :3100. RLS in this stack is the real Postgres RLS. The fakes follow the official docs' shapes; they prove our handling of those shapes, **not** that the live services behave identically. To run e2e against a real Supabase project instead, set `E2E_EXTERNAL=1 E2E_BASE_URL=…`.

## Validation status (be honest about what was and wasn't run)

| Area | Status |
|---|---|
| Unit tests (sync, quota, dedupe, hashing, amendments, classification, pricing, citations, AI schema/downgrade, docs extraction, DIBBS parser, search, alerts, dashboard maths, design-token contrast) | ✅ run, passing |
| Migrations + RLS (tenant isolation, roles, viewer sees no supplier/pricing, append-only audit log, PASS guard, last-owner guard, Submitted guard, rate limit, classification parity) | ✅ run against Postgres 16 |
| USAspending lookup | ✅ run **live** (three strategies merged, real awards) |
| End-to-end flow (sign in → profile → sync → filter → detail → fetch docs → analyze → checklist → supplier/quote → price → pipeline → alert) + role/safety tests | ✅ 17 tests passing against the local QA stack |
| Lighthouse (desktop, local) | ✅ Performance 100, Accessibility 95–100 (issues found were fixed afterwards) |
| Design QA screenshots (light/dark × desktop/tablet/mobile) | ✅ reviewed; defects found were fixed |
| **Live SAM.gov sync** | ❌ **not run** — no `SAM_API_KEY` was available in the build environment |
| **Live Claude analyses / "three real solicitations" validation** | ❌ **not run** — no `ANTHROPIC_API_KEY`. Request/response plumbing, structured-output schema, streaming, citation checking and persistence were exercised against a fake endpoint; model quality, real citation-rejection rates and real costs are **unmeasured** |
| Real Supabase project (Auth emails, Storage, hosted PostgREST) | ❌ not run — the QA shim stands in locally |
| Vercel deployment / cron | ❌ not run |

Before relying on it, run a live sync with your key and analyze a DoD supply RFQ and a services RFP; check **Settings → AI usage** for citation-rejection counts and cost.

## Project layout

See `docs/ARCHITECTURE.md`. Deviations from the spec and why: `docs/DEVIATIONS.md`. Spec-vs-docs discrepancies: `docs/DISCREPANCIES.md`.

## Estimated monthly running cost (small team, ~40 analyzed opportunities/month)

| Item | Estimate | Notes |
|---|---|---|
| Supabase | $0 – $25 | Free tier works for a trial (pauses when idle, 1 GB storage). Pro ($25) recommended for backups and no pausing. |
| Vercel | $0 – $20 | Hobby is enough to try it but limits cron to daily and function duration; Pro ($20/seat) for hourly alerts and 5-minute AI routes. |
| Resend | $0 | Free tier covers a few hundred digests a month. |
| SAM.gov, USAspending | $0 | Free public APIs. |
| Claude | **~$20 – $60** | **Estimate, not measured.** At claude-opus-5-5 list prices ($4 in / $20 out per MTok, cache reads $0.20): a 100-page solicitation ≈ 75k input tokens (~$0.30) plus ~8k visible output and extended-thinking tokens (~$0.15–0.60) ≈ **$0.50–$1.00 per brief**; extraction on the same documents reads the cached prefix. AI search ≈ a cent or two. Cap it in Settings (default $50/month). Use `AI_MODEL_BRIEF=claude-sonnet-5-5` to roughly halve it. |
| **Total** | **≈ $20 – $105** | Low end: free tiers + light AI use. Typical production: ~$45 platform + AI. |

## Known limitations

See the end of `docs/DEVIATIONS.md`.

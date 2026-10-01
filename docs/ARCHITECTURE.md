# Fieldpoint architecture

```
app/
  (auth)/sign-in/                 magic link + password (Supabase Auth)
  (app)/                          authenticated shell: sidebar, toolbar, inspector
    dashboard/ opportunities/ opportunities/[id]/ pipeline/ suppliers/ suppliers/[id]/
    alerts/ searches/ company/ settings/ import/
  api/cron/{sync-sam,alerts}/     CRON_SECRET-protected
  api/opportunities/[id]/{analyze,extract,historical,documents/fetch}/
  api/import/dibbs/  api/search/ai/
components/ui/                    design-system primitives (Radix + tokens)
components/app/                   feature components
lib/
  env.ts                          Zod-validated env (server / public split)
  design/tokens.ts                single source for colour/type/space/radius/motion
  supabase/{server,client,admin}  three clients; admin is server-only
  sam/                            client, notice-types, normalise, hash, diff, plan, sync
  usaspending/                    client + strategies + merge
  ai/                             single module: config, prompts, schemas, run, citations, cost
  docs/                           pdf / docx / xlsx extraction, section detection
  classification.ts  pricing.ts  checklist.ts  alerts.ts  search.ts
supabase/migrations/              0001 schema · 0002 triggers · 0003 RLS · 0004 storage
supabase/tests/shim.sql           local-Postgres stand-in for auth.* (tests only)
tests/                            Vitest (unit + db) and Playwright (e2e)
```

Data flow: SAM → `lib/sam/sync` (cron) → `opportunities` (+ amendments/alerts) → UI reads DB only.
Opportunities are shared public rows (`company_id is null`); DIBBS imports are company-private.
Per-company state lives in `company_opportunities` and its children, all carrying `company_id`
with composite FKs so a row can never reference another tenant's parent.

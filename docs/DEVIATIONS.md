# Deviations from the build spec (and why)

## Design
1. **Colour tokens nudged for WCAG AA.** The spec's exact values failed AA in some pairings (checked by `lib/design/tokens.test.ts`): light `accent #0A60D6 → #0A58C6`, `green #1F8A4C → #16703B`, `red #C9372C → #B02A20`, status-gray *text* `→ #5C5C61`, `label.secondary #6E6E73 → #636366`, `label.tertiary #AEAEB2 → #8E8E93`, `yellow` text `#B7791F → #8A5A00` (fill unchanged), dark `accent #3D8BFF → #5A9BFF`. Placeholder/disabled text uses `label.tertiary` (≈3.3:1) as is conventional for disabled controls.
2. **Onboarding is a centered card page**, not a sheet over the app (there is no app to put behind it before a company exists).
3. **Default table columns** hide PSC, set-aside, place of performance and posted date so the table plus inspector fit at 1440 px; all 13 columns are available in the column menu and remembered.
4. Time zones: deadlines are stored UTC and shown in the **viewer's** zone with the original **UTC offset** noted ("posted as UTC-04:00"), because an offset is unambiguous and a zone abbreviation is not.

## Stack
5. **Next.js 16** (`proxy.ts` instead of `middleware.ts`; async params). **TanStack Table v8** (v9's API differs substantially; v8 is the long-stable line). **SheetJS `xlsx` from the vendor CDN** (npm's copy is stale/vulnerable).
6. **Default AI model is `claude-opus-5-5`** for brief, extraction and search (configurable per task); the spec didn't name one.
7. Structured outputs use `output_config.format` (GA). Schemas contain no unsupported keywords; length/range rules are enforced by Zod after the call (see `docs/DISCREPANCIES.md`).

## Data model
8. **Extra tables/columns** beyond the spec's list: `company_invites` (team invites accepted at first sign-in), `checklist_templates` (editable template), `historical_lookups` (7-day cache), `rate_limit_events` (per-user limits via `check_rate_limit()`), `opportunities.company_id` (DIBBS imports are company-private; public SAM rows have `null`), `opportunities.value_amount`, `response_deadline_raw`, `description_fetched_at`, `cancelled`, `dibbs jsonb`, `sync_runs.cursor/purpose/found/window_*`, composite `(id, company_id)` keys so a child row can never point at another tenant's parent. `company_id` is on every company-scoped table (RLS stays simple).
9. **`sync_runs` has one row per invocation** (not per logical sync) so daily quota accounting is exact; a partial run's cursor moves to the next invocation's row.
10. "Potential value" and the value filter use **stated** values only. SAM notices rarely carry an estimated value; today that is the award amount on Award Notices. Everything else is "Unknown".

## Behaviour
11. **Descriptions are fetched on demand** (SAM returns a URL, one extra call each) — keyword search covers title, solicitation #, agency, fetched descriptions and extracted document text.
12. **The scheduled sync stores only notices matching a company's NAICS codes** (and refuses to run with none configured) rather than every notice SAM returns.
13. **Citation downgrade rule:** a statement that had citations rejected is downgraded to *Needs verification* only if it was labelled *Verified* and has no surviving citation (an *AI analysis* statement stays an analysis). "Not mentioned"/"Unclear" defense flags can never be *Verified* (absence isn't citable).
14. **Notice-record citations:** structured SAM/DIBBS fields are rendered as a citable "Stored notice record" pseudo-document so claims about dates/NAICS/etc. are machine-checked like document claims.
15. **AI never receives supplier, quote or pricing data** (the spec allowed it only on explicit request; no feature needs it).
16. Notes use a small contenteditable editor (`document.execCommand`, deprecated but universally supported) with server-side sanitisation; swap for a rich-text library if you need more.
17. Viewer: PDF **Page view** (pdf.js, thumbnails, search, citation highlight by text-position matching) plus **Text view** from the extracted text. Highlighting is approximate when a PDF's text layout differs from the extracted string; the viewer says so instead of silently showing nothing.
18. Pipeline drag uses dnd-kit; each card also has a **Move to…** menu (keyboard/screen-reader path).
19. Hourly cron needs Vercel Pro; `pg_cron` is documented, not shipped.
20. `SAM_SEARCH_URL` is a test-only override so a fake endpoint can be used locally.

## Not done / partial / known limitations
* **No live SAM or Claude validation** (no keys in the build environment) — see README "Validation status". The spec's "analyze three real solicitations" step is therefore **outstanding**.
* **SAM `offset` semantics** follow the docs page ("page index"); not verified against the live API. If your key returns record offsets, change one line in `lib/sam/sync.ts` (`task.page` → `task.page * limit`).
* SAM's response shapes for `placeOfPerformance`, `award`, `pointOfContact` are handled defensively from the docs but unverified live.
* Notification gaps: **"solicitation text changed"** alerts are defined but only fire if a description is re-fetched and differs (re-fetch isn't wired); **"new attachment"/"deadline changed"/"amendment"** come from the sync diff.
* No OCR: scanned pages are flagged "OCR needed" and excluded from analysis, never guessed at.
* The AI Fit/Complexity info popovers on list rows explain *what the value is*; the actual rationale (with labels) is on the AI Analysis tab.
* Lists virtualise rows and page 100 at a time; I did not load-test 10,000+ rows.
* Real Supabase Auth email templates (magic link/verify) must be configured in your project; the app supports both PKCE (`/auth/callback`) and token-hash (`/auth/confirm`) links.
* The Supabase-compatible QA shim is a test tool, not a PostgREST replacement; run the e2e suite against a real project (`E2E_EXTERNAL=1`) before launch.

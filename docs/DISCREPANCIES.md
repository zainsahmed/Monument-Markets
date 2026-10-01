# Spec vs. official docs — discrepancies

Checked 2026-10-01 against the SAM.gov Get Opportunities Public API page, the USAspending
API (live calls), and the Anthropic platform docs. Where they differ from the build spec,
the docs won. Items marked **(live)** were confirmed by an actual request.

## SAM.gov
1. **`description` is a URL, not text.** The search response returns a link to the
   description; fetching it needs the API key appended and is an additional call. The spec's
   "store description at sync" cannot be done for every notice inside a small daily quota.
   → Descriptions are fetched on demand (open / save / analyze) using the reserved
   on-demand calls, and cached in `opportunities.description` with `description_fetched_at`.
   Keyword search therefore covers title, solicitation #, agency, fetched descriptions and
   extracted document text.
2. **`ncode` and `ptype` accept one value each.** "Filtered to the company's NAICS codes" is
   one request per NAICS code (not one request). → The sync planner (`lib/sam/plan.ts`) picks
   per-NAICS calls when they fit the day's budget and otherwise sweeps the window unfiltered
   (1,000 per call) and filters locally. Both paths are resumable via `sync_runs.cursor`.
3. **Quota is not stated on the docs page** ("limited based on federal / non-federal /
   general roles"). Default stays `SAM_DAILY_QUOTA=10` as the spec says; configurable.
4. **Notice type is returned as text (`type`, `baseType`), not the one-letter code.** The code
   is derived from the name (`lib/sam/notice-types.ts`); `ptype` is still the one-letter filter.
5. **`active` is the string "Yes"/"No"**; separate `status` filter has `active, inactive,
   archived, cancelled, deleted`. Cancelled is tracked in its own column.
6. **`limit` max = 1000, default 1; `offset` is a page index** (confirmed on the docs page).
   Window ≤ 1 year for `postedFrom/To` and `rdlfrom/rdlto`.
7. `responseDeadLine` carries a UTC offset; stored as `timestamptz` plus the raw string so the
   original zone can be shown.
8. No "agency filter" parameter by agency *path*; `organizationName` / `organizationCode`
   exist. Target-agency filtering is applied locally on `fullParentPathName`.

## USAspending
9. **`limit` max is 100** per page for `spending_by_award` **(live)** — pagination is needed.
10. `award_type_codes` is required in filters. Result fields are the display names
    ("Award ID", "Recipient Name", "Award Amount", "Start Date", "Awarding Agency", …) and
    `generated_internal_id` builds the link `https://www.usaspending.gov/award/<id>` **(live)**.

## Anthropic
11. **Structured outputs are GA via `output_config.format = {type:"json_schema", schema}`**
    (the `output_format` param + beta header is deprecated). The schema subset forbids
    `minimum/maximum/minLength/maxLength`, recursion, and caps optional/union params, so
    length/range rules are enforced by Zod after the call, not by the API. Changing the format
    invalidates the prompt cache for that conversation — we keep one schema per call kind.
12. Enum casing can drift → compared case-insensitively before Zod validation.
13. PDF input limit is 32 MB / 100 pages (when context < 1M) — we do **not** send PDFs; we send
    extracted, page-marked text, which is also what makes citation checking possible.
14. Native "citations" are not used: citations are our own `{documentId, page, section,
    snippet}` objects verified programmatically (spec §8.3).

## Packages
15. **Next.js is 16.x**: `middleware.ts` is now `proxy.ts`; route `params` are Promises.
16. **`xlsx` on npm is stale (0.18.5) with known advisories**; SheetJS publishes current
    releases from its own CDN. Installed `xlsx@0.20.3` from `cdn.sheetjs.com`.
17. TanStack Table / Zod / Vitest majors are newer than the spec's era; code targets installed versions.

## Environment-only limits (this build session)
18. No `SAM_API_KEY`, `ANTHROPIC_API_KEY`, or Supabase project were available in the build
    environment, so live SAM sync, live AI analyses and the Supabase-hosted E2E could not be run
    here. See README "Validation status".

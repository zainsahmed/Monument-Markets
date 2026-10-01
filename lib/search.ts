import { z } from 'zod'

/** Standard filter model shared by the list UI, saved searches, AI search and server queries (spec §15). */
export const TABS = ['bid_ready', 'watch', 'awarded', 'all'] as const
export const FiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  tab: z.enum(TABS).default('all'),
  source: z.enum(['SAM', 'DIBBS']).optional(),
  departments: z.array(z.string()).default([]),
  subTiers: z.array(z.string()).default([]),
  naics: z.array(z.string()).default([]),
  psc: z.array(z.string()).default([]),
  setAsides: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
  zip: z.string().optional(),
  noticeTypes: z.array(z.string()).default([]),
  active: z.boolean().optional(),
  postedFrom: z.string().optional(), // yyyy-mm-dd
  postedTo: z.string().optional(),
  deadlineFrom: z.string().optional(),
  deadlineTo: z.string().optional(),
  valueMin: z.number().optional(),
  valueMax: z.number().optional(),
})
export type Filters = z.infer<typeof FiltersSchema>
export const emptyFilters = (): Filters => FiltersSchema.parse({})

/** The subset of the PostgREST builder we call, so this is unit-testable. */
export interface QueryLike<T> {
  eq(col: string, v: unknown): T
  in(col: string, v: unknown[]): T
  gte(col: string, v: unknown): T
  lte(col: string, v: unknown): T
  ilike(col: string, v: string): T
  or(filter: string): T
}

const TAB_LABEL = { bid_ready: 'GREEN', watch: 'YELLOW', awarded: 'RED' } as const

/** Applies every non-keyword filter. Keyword filtering is done by the caller via the search_opportunity_ids RPC. */
export function applyFilters<Q extends QueryLike<Q>>(q: Q, f: Filters): Q {
  let r = q
  if (f.tab !== 'all') r = r.eq('color_label', TAB_LABEL[f.tab])
  if (f.source) r = r.eq('source', f.source)
  if (f.departments.length) r = r.in('department', f.departments)
  if (f.subTiers.length) r = r.in('sub_tier', f.subTiers)
  if (f.naics.length) r = r.in('naics', f.naics)
  if (f.psc.length) r = r.in('psc', f.psc)
  if (f.setAsides.length) r = r.in('set_aside_code', f.setAsides)
  if (f.states.length) r = r.in('pop_state', f.states)
  if (f.zip) r = r.ilike('pop_zip', `${f.zip.replace(/[%_]/g, '')}%`)
  if (f.noticeTypes.length) r = r.in('notice_type_code', f.noticeTypes)
  if (f.active !== undefined) r = r.eq('active', f.active)
  if (f.postedFrom) r = r.gte('posted_date', f.postedFrom)
  if (f.postedTo) r = r.lte('posted_date', f.postedTo)
  if (f.deadlineFrom) r = r.gte('response_deadline', `${f.deadlineFrom}T00:00:00Z`)
  if (f.deadlineTo) r = r.lte('response_deadline', `${f.deadlineTo}T23:59:59Z`)
  if (f.valueMin !== undefined) r = r.gte('value_amount', f.valueMin)
  if (f.valueMax !== undefined) r = r.lte('value_amount', f.valueMax)
  return r
}

export interface Chip { key: keyof Filters; label: string; value: string }
const money = (n: number) => `$${n.toLocaleString('en-US')}`
/** Human-readable chips ("Agency: Dept of Defense", "Value: < $500,000", "Active"). */
export function filterChips(f: Filters): Chip[] {
  const c: Chip[] = []
  const list = (key: keyof Filters, label: string, v: string[]) => v.length && c.push({ key, label, value: v.join(', ') })
  if (f.q) c.push({ key: 'q', label: 'Keywords', value: f.q })
  if (f.source) c.push({ key: 'source', label: 'Source', value: f.source })
  list('departments', 'Agency', f.departments); list('subTiers', 'Sub-tier', f.subTiers); list('naics', 'NAICS', f.naics); list('psc', 'PSC', f.psc)
  list('setAsides', 'Set-aside', f.setAsides); list('states', 'Location', f.states); list('noticeTypes', 'Notice type', f.noticeTypes)
  if (f.zip) c.push({ key: 'zip', label: 'ZIP', value: f.zip })
  if (f.active !== undefined) c.push({ key: 'active', label: 'Status', value: f.active ? 'Active' : 'Inactive' })
  if (f.postedFrom || f.postedTo) c.push({ key: 'postedFrom', label: 'Posted', value: `${f.postedFrom ?? '…'} → ${f.postedTo ?? '…'}` })
  if (f.deadlineFrom || f.deadlineTo) c.push({ key: 'deadlineFrom', label: 'Deadline', value: `${f.deadlineFrom ?? '…'} → ${f.deadlineTo ?? '…'}` })
  if (f.valueMin !== undefined && f.valueMax !== undefined) c.push({ key: 'valueMin', label: 'Value', value: `${money(f.valueMin)} – ${money(f.valueMax)}` })
  else if (f.valueMax !== undefined) c.push({ key: 'valueMax', label: 'Value', value: `< ${money(f.valueMax)}` })
  else if (f.valueMin !== undefined) c.push({ key: 'valueMin', label: 'Value', value: `> ${money(f.valueMin)}` })
  return c
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5)

/** AI search output (strict schema, 0 = unset) → standard filters. The AI never returns rows. */
export function fromAiFilters(a: import('./ai/schemas').SearchFilters, now = new Date()): Filters {
  const tabFromLabels = a.color_labels.length === 1 ? (a.color_labels[0] === 'GREEN' ? 'bid_ready' : a.color_labels[0] === 'YELLOW' ? 'watch' : 'awarded') : 'all'
  return FiltersSchema.parse({
    q: a.keywords.trim() || undefined,
    tab: tabFromLabels,
    source: a.source === 'ANY' ? undefined : a.source,
    departments: a.departments, naics: a.naics, psc: a.psc, setAsides: a.set_asides,
    states: a.states.map((s) => s.toUpperCase()), noticeTypes: a.notice_type_codes,
    active: a.active_only ? true : undefined,
    postedFrom: a.posted_within_days > 0 ? isoDay(addDays(now, -a.posted_within_days)) : undefined,
    deadlineFrom: a.deadline_within_days > 0 ? isoDay(now) : undefined,
    deadlineTo: a.deadline_within_days > 0 ? isoDay(addDays(now, a.deadline_within_days)) : undefined,
    valueMin: a.value_min > 0 ? a.value_min : undefined,
    valueMax: a.value_max > 0 ? a.value_max : undefined,
  })
}

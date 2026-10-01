/**
 * USAspending historical awards (spec §5.2). Public API, no key. `limit` max is 100 per page (verified live).
 * Historical awards are CONTEXT, never the right price (principle 7).
 */
export const USASPENDING_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/'
export const AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'] // contracts: BPA call, purchase order, delivery order, definitive contract
export const MAX_PAGE = 100

export const FIELDS = [
  'Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency', 'Awarding Sub Agency',
  'Contract Award Type', 'NAICS', 'PSC', 'Type of Set Aside', 'Place of Performance State Code', 'Primary Place of Performance', 'Description', 'generated_internal_id',
]

export type StrategyName = 'naics_psc' | 'naics_agency' | 'keyword'
export interface OppForLookup { title: string; naics: string | null; psc: string | null; department: string | null; pop_state?: string | null }
export interface Strategy { name: StrategyName; filters: Record<string, unknown> }

export interface AwardRow {
  award_id: string
  generated_internal_id: string | null
  recipient: string | null
  agency: string | null
  sub_agency: string | null
  award_date: string | null
  amount: number | null
  contract_type: string | null
  naics: string | null
  psc: string | null
  set_aside: string | null
  pop: string | null
  matched_by: StrategyName[]
  usaspending_url: string | null
}

const SMALL = new Set(['of', 'the', 'and', 'for', 'to', 'in'])
/** SAM "DEPT OF DEFENSE" → USAspending toptier "Department of Defense". Returns null if we can't map confidently. */
export function toToptierAgency(samDepartment: string | null): string | null {
  if (!samDepartment) return null
  const raw = samDepartment.replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const known: Record<string, string> = {
    'DEPT OF DEFENSE': 'Department of Defense',
    'DEFENSE, DEPARTMENT OF': 'Department of Defense',
    'DEPT OF HOMELAND SECURITY': 'Department of Homeland Security',
    'GENERAL SERVICES ADMINISTRATION': 'General Services Administration',
    'NATIONAL AERONAUTICS AND SPACE ADMINISTRATION': 'National Aeronautics and Space Administration',
    'VETERANS AFFAIRS, DEPARTMENT OF': 'Department of Veterans Affairs',
    'HOMELAND SECURITY, DEPARTMENT OF': 'Department of Homeland Security',
  }
  const up = raw.toUpperCase()
  if (known[up]) return known[up]
  const expanded = up.replace(/^DEPT\b/, 'DEPARTMENT')
  const m = expanded.match(/^(.+), DEPARTMENT OF( THE)?$/)
  const words = (m ? `DEPARTMENT OF ${m[1]}` : expanded).split(' ')
  return words.map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase())).join(' ')
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'services', 'service', 'supply', 'supplies', 'contract', 'solicitation', 'notice', 'request', 'quote', 'proposal', 'procurement', 'purchase', 'order', 'item', 'items', 'various', 'support', 'dept', 'department', 'army', 'navy', 'force', 'air'])
export function keywordsFromTitle(title: string, max = 4): string[] {
  const tokens = title.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 4 && !STOP.has(t) && /[a-z]/.test(t))
  return [...new Set(tokens)].slice(0, max)
}

export function timePeriod(now = new Date(), years = 5) {
  // US federal fiscal years start Oct 1; look back `years` fiscal years including the current one.
  const fy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
  return [{ start_date: `${fy - years}-10-01`, end_date: `${fy}-09-30` }]
}

export function buildStrategies(o: OppForLookup, now = new Date()): Strategy[] {
  const base = { award_type_codes: AWARD_TYPE_CODES, time_period: timePeriod(now) }
  const out: Strategy[] = []
  if (o.naics && o.psc) out.push({ name: 'naics_psc', filters: { ...base, naics_codes: [o.naics], psc_codes: [o.psc] } })
  const agency = toToptierAgency(o.department)
  if (o.naics && agency) out.push({ name: 'naics_agency', filters: { ...base, naics_codes: [o.naics], agencies: [{ type: 'awarding', tier: 'toptier', name: agency }] } })
  const kw = keywordsFromTitle(o.title)
  if (kw.length >= 2) out.push({ name: 'keyword', filters: { ...base, keywords: kw, ...(o.naics ? { naics_codes: [o.naics] } : {}) } })
  return out
}

function parseRow(r: Record<string, any>, name: StrategyName): AwardRow | null {
  const id = r['Award ID']
  if (!id) return null
  const gid = typeof r.generated_internal_id === 'string' ? r.generated_internal_id : null
  const popObj = r['Primary Place of Performance'] as Record<string, string> | null
  const pop = popObj ? [popObj.city_name, popObj.state_code].filter(Boolean).join(', ') : r['Place of Performance State Code'] ?? null
  return {
    award_id: String(id),
    generated_internal_id: gid,
    recipient: r['Recipient Name'] ?? null,
    agency: r['Awarding Agency'] ?? null,
    sub_agency: r['Awarding Sub Agency'] ?? null,
    award_date: r['Start Date'] ?? null,
    amount: typeof r['Award Amount'] === 'number' ? r['Award Amount'] : null,
    contract_type: r['Contract Award Type'] ?? null,
    naics: r.NAICS?.code ?? null,
    psc: r.PSC?.code ?? null,
    set_aside: r['Type of Set Aside'] ?? null,
    pop: pop || null,
    matched_by: [name],
    usaspending_url: gid ? `https://www.usaspending.gov/award/${encodeURIComponent(gid)}` : null,
  }
}

export interface LookupResult {
  awards: AwardRow[]
  strategies: Array<{ name: StrategyName; count: number; error?: string }>
}

export async function lookupHistoricalAwards(o: OppForLookup, opts: { fetchImpl?: typeof fetch; now?: Date; pages?: number } = {}): Promise<LookupResult> {
  const f = opts.fetchImpl ?? fetch
  const strategies = buildStrategies(o, opts.now)
  const merged = new Map<string, AwardRow>()
  const report: LookupResult['strategies'] = []
  for (const s of strategies) {
    let count = 0
    try {
      for (let page = 1; page <= (opts.pages ?? 1); page++) {
        const res = await f(USASPENDING_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ filters: s.filters, fields: FIELDS, sort: 'Start Date', order: 'desc', limit: MAX_PAGE, page }),
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`USAspending ${res.status}: ${(await res.text()).slice(0, 160)}`)
        const json = (await res.json()) as { results?: Array<Record<string, any>>; page_metadata?: { hasNext?: boolean } }
        for (const raw of json.results ?? []) {
          const row = parseRow(raw, s.name)
          if (!row) continue
          count++
          const key = row.generated_internal_id ?? row.award_id
          const prev = merged.get(key)
          if (prev) { if (!prev.matched_by.includes(s.name)) prev.matched_by.push(s.name) } else merged.set(key, row)
        }
        if (!json.page_metadata?.hasNext) break
      }
      report.push({ name: s.name, count })
    } catch (e) {
      report.push({ name: s.name, count, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return { awards: [...merged.values()], strategies: report }
}

export interface AwardSummary { count: number; withAmount: number; median: number | null; min: number | null; max: number | null }
/** Summary over KNOWN amounts only — unknown amounts are counted but never treated as zero. */
export function summarizeAwards(awards: Array<{ amount: number | null }>): AwardSummary {
  const amts = awards.map((a) => a.amount).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (amts.length === 0) return { count: awards.length, withAmount: 0, median: null, min: null, max: null }
  const mid = Math.floor(amts.length / 2)
  const median = amts.length % 2 ? amts[mid] : (amts[mid - 1] + amts[mid]) / 2
  return { count: awards.length, withAmount: amts.length, median, min: amts[0], max: amts[amts.length - 1] }
}

export const HISTORICAL_DISCLAIMER = 'Historical awards show what the government bought before. They are not the correct price for this solicitation.'

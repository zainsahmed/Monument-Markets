import 'server-only'
import type { Session } from '@/lib/auth'
import type { CompanyOpportunity, Opportunity } from '@/lib/db-types'
import { applyFilters, type Filters } from '@/lib/search'

export interface OppRow extends Opportunity {
  co: Pick<CompanyOpportunity, 'id' | 'workflow_status' | 'pipeline_stage' | 'saved' | 'ai_fit' | 'complexity'> | null
  docs: number
  similar: number
  supplier: 'Found' | 'Needed' | 'Unknown'
}

export const SORTS = {
  deadline: { col: 'response_deadline', asc: true },
  posted: { col: 'posted_date', asc: false },
  title: { col: 'title', asc: true },
  agency: { col: 'department', asc: true },
  naics: { col: 'naics', asc: true },
  value: { col: 'value_amount', asc: false },
} as const
export type SortKey = keyof typeof SORTS

const SELECT = '*, co:company_opportunities(id, workflow_status, pipeline_stage, saved, ai_fit, complexity, sup:opportunity_suppliers(count)), docs:opportunity_documents(count), similar:historical_awards(count)'

/** Paginated, filtered, RLS-scoped query. Keyword search runs in Postgres (title + description + extracted document text). */
export async function queryOpportunities(s: Session, f: Filters, opts: { offset?: number; limit?: number; sort?: SortKey; dir?: 'asc' | 'desc'; savedOnly?: boolean } = {}): Promise<{ rows: OppRow[]; total: number | null }> {
  const limit = Math.min(opts.limit ?? 100, 200)
  const offset = opts.offset ?? 0
  let ids: string[] | null = null
  if (f.q) {
    const { data } = await s.supabase.rpc('search_opportunity_ids', { q: f.q, lim: 5000 })
    const found: string[] = (data ?? []).map((r: { opportunity_id: string }) => r.opportunity_id)
    if (found.length === 0) return { rows: [], total: 0 }
    ids = found
  }
  const sort = SORTS[opts.sort ?? 'deadline']
  const asc = opts.dir ? opts.dir === 'asc' : sort.asc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = s.supabase.from('opportunities').select(opts.savedOnly ? SELECT.replace('co:company_opportunities(', 'co:company_opportunities!inner(') : SELECT, { count: 'estimated' })
  q = applyFilters(q, f)
  if (opts.savedOnly) q = q.eq('co.saved', true)
  if (ids) q = q.in('id', ids)
  q = q.order(sort.col, { ascending: asc, nullsFirst: false }).order('id').range(offset, offset + limit - 1)
  const { data, count, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []).map((r: Record<string, any>): OppRow => ({ ...(r as Opportunity), co: (r.co ?? [])[0] ? (({ sup: _sup, ...c }) => c)((r.co ?? [])[0]) : null, docs: r.docs?.[0]?.count ?? 0, similar: r.similar?.[0]?.count ?? 0, supplier: s.role === 'viewer' ? 'Unknown' : (r.co?.[0]?.sup?.[0]?.count ?? 0) > 0 ? 'Found' : 'Needed' }))
  return { rows, total: count }
}

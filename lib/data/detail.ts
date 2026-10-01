import 'server-only'
import type { Session } from '@/lib/auth'
import type { Opportunity, CompanyOpportunity, OpportunityDocument } from '@/lib/db-types'
import { sourceHash } from '@/lib/opportunities/context'
import type { Brief, Extraction } from '@/lib/ai/postprocess'
import type { CheckStats } from '@/lib/ai/citations'
import { DEFAULT_TEMPLATE, profileSuggestions } from '@/lib/checklist'

export interface Analysis<T> { id: string; created_at: string; model: string; cost_usd: number; citation_rejections: number; citation_total: number; source_hash: string | null; output: T }
export interface DetailData {
  opp: Opportunity
  co: CompanyOpportunity | null
  docs: OpportunityDocument[]
  amendments: Array<{ id: string; detected_at: string; field: string; old_value: unknown; new_value: unknown }>
  chain: Array<{ id: string; title: string; notice_type: string | null; notice_type_code: string | null; posted_date: string | null; color_label: 'GREEN' | 'YELLOW' | 'RED' }>
  brief: Analysis<{ brief: Brief; citation_stats: CheckStats; unparsed_documents: string[] }> | null
  extraction: Analysis<{ extraction: Extraction; citation_stats: CheckStats }> | null
  briefStale: boolean
  failedAnalysis: { created_at: string; error: string } | null
  facts: Array<{ id: string; category: string; text: string; label: 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION'; document_id: string | null; page: number | null; section: string | null; snippet: string | null; analysis_id: string }>
  checklist: Array<{ id: string; group: string; key: string; label: string; status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NA'; ai_suggestion: { status: string; rationale: string; label: string; citations: Array<{ documentId: string; page: number; section: string; snippet: string }> } | null; note: string | null; evidence: { label?: string; url?: string } | null }>
  template: Array<{ group: string; key: string; label: string }>
  awards: Array<{ id: string; award_id: string; recipient: string | null; agency: string | null; sub_agency: string | null; award_date: string | null; amount: number | null; contract_type: string | null; naics: string | null; psc: string | null; set_aside: string | null; pop: string | null; matched_by: string[]; usaspending_url: string | null }>
  lookup: { fetched_at: string; strategies: Array<{ name: string; count: number; error?: string }> } | null
  attached: Array<{ id: string; supplier_id: string; sourcing_checklist: Record<string, boolean>; supplier: { id: string; name: string; status: string | null; lead_time_days: number | null; website: string | null } }>
  suppliers: Array<{ id: string; name: string }>
  quotes: Array<{ id: string; supplier_id: string; amount: number; currency: string; quote_date: string; valid_until: string | null; notes: string | null; file_path: string | null; company_opportunity_id: string | null }>
  pricing: Array<{ id: string; version: number; label: string | null; desired_margin: number | null; target_price: number | null; notes: string | null; is_estimated: boolean; created_at: string; lines: Array<Record<string, any>> }>
  notes: Array<{ id: string; body: string; created_at: string; author_id: string | null; author: string | null }>
  tasks: Array<{ id: string; title: string; due_date: string | null; assignee_id: string | null; done: boolean }>
  activity: Array<{ id: string; created_at: string; actor: string | null; action: string; entity_type: string; before: unknown; after: unknown }>
  members: Array<{ user_id: string; name: string }>
  aiSpend: { spent: number; cap: number }
  hints: Record<string, { status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NA'; why: string }>
  minMargin: number | null
}

/** Everything the detail page needs, read through the user's session so RLS decides what each role may see. */
export async function loadDetail(s: Session, id: string): Promise<DetailData | null> {
  const sb = s.supabase
  const { data: opp } = await sb.from('opportunities').select('*').eq('id', id).maybeSingle()
  if (!opp) return null
  const { data: co } = await sb.from('company_opportunities').select('*').eq('company_id', s.companyId).eq('opportunity_id', id).maybeSingle()
  const sensitive = s.role !== 'viewer'
  const coId = co?.id as string | undefined
  const [docs, amendments, chain, analyses, checklist, tpl, awards, lookup, attached, suppliers, quotes, pricing, notes, tasks, activity, members, spend] = await Promise.all([
    sb.from('opportunity_documents').select('*').eq('opportunity_id', id).order('created_at'),
    sb.from('opportunity_amendments').select('id, detected_at, field, old_value, new_value').eq('opportunity_id', id).order('detected_at', { ascending: false }).limit(100),
    opp.solicitation_number ? sb.from('opportunities').select('id, title, notice_type, notice_type_code, posted_date, color_label').eq('solicitation_number', opp.solicitation_number).or(`company_id.is.null,company_id.eq.${s.companyId}`).order('posted_date') : Promise.resolve({ data: [] as never[] }),
    coId ? sb.from('ai_analyses').select('id, kind, status, error, created_at, model, cost_usd, citation_rejections, citation_total, source_hash, output').eq('company_opportunity_id', coId).in('kind', ['brief', 'extraction']).order('created_at', { ascending: false }).limit(12) : Promise.resolve({ data: [] as never[] }),
    coId ? sb.from('checklist_items').select('id, group, key, label, status, ai_suggestion, note, evidence').eq('company_opportunity_id', coId) : Promise.resolve({ data: [] as never[] }),
    sb.from('checklist_templates').select('items').eq('company_id', s.companyId).maybeSingle(),
    sb.from('historical_awards').select('*').eq('opportunity_id', id).order('award_date', { ascending: false }).limit(300),
    sb.from('historical_lookups').select('fetched_at, strategies').eq('opportunity_id', id).maybeSingle(),
    sensitive && coId ? sb.from('opportunity_suppliers').select('id, supplier_id, sourcing_checklist, supplier:suppliers(id, name, status, lead_time_days, website)').eq('company_opportunity_id', coId) : Promise.resolve({ data: [] as never[] }),
    sensitive ? sb.from('suppliers').select('id, name').order('name') : Promise.resolve({ data: [] as never[] }),
    sensitive ? sb.from('supplier_quotes').select('*').or(coId ? `company_opportunity_id.eq.${coId}` : 'id.is.null').order('quote_date', { ascending: false }) : Promise.resolve({ data: [] as never[] }),
    sensitive && coId ? sb.from('pricing').select('*, lines:pricing_lines(*)').eq('company_opportunity_id', coId).order('version', { ascending: false }) : Promise.resolve({ data: [] as never[] }),
    coId ? sb.from('notes').select('id, body, created_at, author_id').eq('company_opportunity_id', coId).order('created_at', { ascending: false }) : Promise.resolve({ data: [] as never[] }),
    coId ? sb.from('tasks').select('id, title, due_date, assignee_id, done').eq('company_opportunity_id', coId).order('done').order('due_date', { nullsFirst: false }) : Promise.resolve({ data: [] as never[] }),
    sb.from('activity_log').select('id, created_at, actor_id, action, entity_type, before, after').eq('opportunity_id', id).order('created_at', { ascending: false }).limit(100),
    sb.from('company_members').select('user_id').eq('company_id', s.companyId),
    sb.rpc('ai_spend_this_month', { cid: s.companyId }),
  ])
  const names = new Map<string, string>()
  const uids = [...new Set([...(members.data ?? []).map((m: any) => m.user_id), ...(notes.data ?? []).map((n: any) => n.author_id), ...(activity.data ?? []).map((a: any) => a.actor_id)].filter(Boolean))]
  if (uids.length) { const { data: profs } = await sb.from('profiles').select('user_id, full_name').in('user_id', uids); (profs ?? []).forEach((p: any) => names.set(p.user_id, p.full_name ?? 'Team member')) }
  const nm = (u: string | null) => (u ? names.get(u) ?? 'Team member' : null)

  const list = (analyses.data ?? []) as any[]
  const latest = (k: string) => list.find((a) => a.kind === k && a.status === 'complete')
  const b = latest('brief'), x = latest('extraction')
  const failed = list.find((a) => a.status === 'error')
  const currentHash = sourceHash(opp as Opportunity, ((docs.data ?? []) as OpportunityDocument[]).map((d) => d.checksum ?? d.id), (opp.description ?? '').length)
  const analysisIds = [b?.id, x?.id].filter(Boolean)
  const facts = analysisIds.length ? (await sb.from('extracted_facts').select('id, category, text, label, document_id, page, section, snippet, analysis_id').in('analysis_id', analysisIds)).data ?? [] : []

  return {
    opp: opp as Opportunity, co: (co as CompanyOpportunity) ?? null, docs: (docs.data ?? []) as OpportunityDocument[],
    amendments: (amendments.data ?? []) as DetailData['amendments'], chain: (chain.data ?? []) as DetailData['chain'],
    brief: b ? { ...b, output: b.output } : null, extraction: x ? { ...x, output: x.output } : null, briefStale: !!b && b.source_hash !== currentHash,
    failedAnalysis: failed && (!b || failed.created_at > b.created_at) ? { created_at: failed.created_at, error: failed.error ?? 'The analysis failed.' } : null, facts: facts as DetailData['facts'],
    checklist: (checklist.data ?? []) as DetailData['checklist'], template: (tpl.data?.items as DetailData['template'] | undefined) ?? DEFAULT_TEMPLATE,
    awards: (awards.data ?? []) as DetailData['awards'], lookup: (lookup.data as DetailData['lookup']) ?? null,
    attached: (attached.data ?? []) as unknown as DetailData['attached'], suppliers: (suppliers.data ?? []) as DetailData['suppliers'], quotes: (quotes.data ?? []) as DetailData['quotes'],
    pricing: (pricing.data ?? []) as DetailData['pricing'], notes: ((notes.data ?? []) as any[]).map((n) => ({ ...n, author: nm(n.author_id) })), tasks: (tasks.data ?? []) as DetailData['tasks'],
    activity: ((activity.data ?? []) as any[]).map((a) => ({ id: a.id, created_at: a.created_at, actor: nm(a.actor_id), action: a.action, entity_type: a.entity_type, before: a.before, after: a.after })),
    members: (members.data ?? []).map((m: any) => ({ user_id: m.user_id, name: nm(m.user_id) ?? 'Team member' })),
    aiSpend: { spent: Number(spend.data ?? 0), cap: Number(s.company.ai_monthly_cap_usd) },
    hints: profileSuggestions(s.company, opp.response_deadline ? new Date(opp.response_deadline) : null), minMargin: s.company.min_gross_margin,
  }
}

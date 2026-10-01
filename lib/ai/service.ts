import 'server-only'
import { getEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Session } from '@/lib/auth'
import { HttpError } from '@/lib/auth'
import { DEFAULT_TEMPLATE } from '@/lib/checklist'
import type { Company, Opportunity } from '@/lib/db-types'
import { loadDocumentIndexes } from '@/lib/opportunities/documents'
import { MAX_INPUT_TOKENS, briefTask, estimateTokens, extractionTask, noticeDocument, sourceHash } from '@/lib/opportunities/context'
import { buildIndex, type DocumentIndex } from './citations'
import { AiBudgetError, AiOutputError, AiRefusalError, callStructured, createClaudeClient } from './run'
import { processBrief, processExtraction } from './postprocess'
import { SYSTEM_BASE, docToText } from './prompts'
import { BriefSchema, ExtractionSchema, SearchFiltersSchema, type SearchFilters } from './schemas'

/** Orchestrates AI calls: budget cap, per-user rate limit, inputs from stored data only, verified output, usage + cost saved. */

export async function monthlySpend(session: Session): Promise<number> {
  const { data } = await session.supabase.rpc('ai_spend_this_month', { cid: session.companyId })
  return Number(data ?? 0)
}
async function guard(session: Session) {
  const cap = Number(session.company.ai_monthly_cap_usd)
  const spent = await monthlySpend(session)
  if (spent >= cap) throw new AiBudgetError(spent, cap)
  const { data: ok } = await session.supabase.rpc('check_rate_limit', { p_bucket: 'ai', p_max: 20, p_window_seconds: 3600 })
  if (!ok) throw new HttpError(429, 'Too many AI requests. Try again in a few minutes.')
}

async function ensureCompanyOpportunity(session: Session, opportunityId: string): Promise<string> {
  const { data: existing } = await session.supabase.from('company_opportunities').select('id').eq('company_id', session.companyId).eq('opportunity_id', opportunityId).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await session.supabase.from('company_opportunities').insert({ company_id: session.companyId, opportunity_id: opportunityId }).select('id').single()
  if (error) throw new HttpError(500, error.message)
  return data.id
}

async function loadInputs(session: Session, opportunityId: string) {
  const { data: opp } = await session.supabase.from('opportunities').select('*').eq('id', opportunityId).maybeSingle()
  if (!opp) throw new HttpError(404, 'Opportunity not found')
  const admin = createAdminClient()
  const { docs, indexes, chars } = await loadDocumentIndexes(admin, opportunityId, session.companyId)
  const notice = noticeDocument(opp as Opportunity)
  const all: DocumentIndex[] = [notice, ...indexes]
  const totalChars = chars + notice.pages[0].text.length
  if (estimateTokens(totalChars) > MAX_INPUT_TOKENS) {
    throw new HttpError(413, `The documents are too large to analyze in one pass (~${Math.round(estimateTokens(totalChars) / 1000)}k tokens). Nothing was truncated; remove some documents and try again.`)
  }
  const kinds = new Map(docs.map((d) => [d.id, d.mime_type?.includes('pdf') ? 'pdf' : d.mime_type?.includes('word') ? 'docx' : d.mime_type?.includes('sheet') ? 'xlsx' : 'txt']))
  const context = all.map((d) => docToText(d, d.documentId.startsWith('notice:') ? 'notice_record' : kinds.get(d.documentId) ?? 'file')).join('\n\n')
  const unparsed = docs.filter((d) => d.parse_status === 'ocr_needed' || d.parse_status === 'failed')
  return { opp: opp as Opportunity, docs, all, context, hash: sourceHash(opp as Opportunity, docs.map((d) => d.checksum ?? d.id), (opp.description ?? '').length), unparsed }
}

function client() {
  return createClaudeClient(getEnv().ANTHROPIC_API_KEY)
}

async function record(session: Session, a: { companyOpportunityId: string | null; kind: 'brief' | 'extraction' | 'search'; model: string; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }; cost: number; output?: unknown; rejections?: number; total?: number; sourceHash?: string; status: 'complete' | 'error'; error?: string }) {
  const { data, error } = await session.supabase.from('ai_analyses').insert({
    company_id: session.companyId, company_opportunity_id: a.companyOpportunityId, kind: a.kind, model: a.model,
    input_tokens: a.usage.input_tokens, output_tokens: a.usage.output_tokens, cache_read_tokens: a.usage.cache_read_input_tokens ?? 0, cache_creation_tokens: a.usage.cache_creation_input_tokens ?? 0,
    cost_usd: a.cost, output: a.output ?? null, citation_rejections: a.rejections ?? 0, citation_total: a.total ?? 0, source_hash: a.sourceHash ?? null, status: a.status, error: a.error ?? null, created_by: session.user.id,
  }).select('id').single()
  if (error) throw new HttpError(500, error.message)
  return data.id as string
}

export async function runPursuitBrief(session: Session, opportunityId: string) {
  await guard(session)
  const env = getEnv()
  const coId = await ensureCompanyOpportunity(session, opportunityId)
  const input = await loadInputs(session, opportunityId)
  const { data: tpl } = await session.supabase.from('checklist_templates').select('items').eq('company_id', session.companyId).maybeSingle()
  const template = (tpl?.items as typeof DEFAULT_TEMPLATE | undefined) ?? DEFAULT_TEMPLATE
  try {
    const res = await callStructured({
      client: client(), model: env.AI_MODEL_BRIEF, schema: BriefSchema, system: SYSTEM_BASE, cachedContext: input.context,
      task: briefTask(session.company as Company, template), effort: env.AI_EFFORT, fallback: env.AI_REFUSAL_FALLBACK === 'on',
    })
    const idx = buildIndex(input.all)
    const { brief, stats } = processBrief(res.data, idx, template.map((t) => t.key))
    const analysisId = await record(session, { companyOpportunityId: coId, kind: 'brief', model: res.model, usage: res.usage, cost: res.costUsd, output: { brief, citation_stats: stats, unparsed_documents: input.unparsed.map((d) => d.file_name) }, rejections: stats.rejected, total: stats.total, sourceHash: input.hash, status: 'complete' })
    await session.supabase.from('company_opportunities').update({ ai_fit: brief.fit.ai_fit, complexity: brief.fit.complexity }).eq('id', coId)
    // Facts: one row per statement so citations are queryable. Notice-record citations have no document row.
    const facts: Array<Record<string, unknown>> = []
    const push = (category: string, s: { text: string; label: string; citations: Array<{ documentId: string; page: number; section: string; snippet: string }> }) => {
      if (s.citations.length === 0) facts.push({ company_id: session.companyId, analysis_id: analysisId, category, text: s.text, label: s.label, verified: false })
      for (const c of s.citations) facts.push({ company_id: session.companyId, analysis_id: analysisId, category, text: s.text, label: s.label, document_id: c.documentId.startsWith('notice:') ? null : c.documentId, page: c.page || null, section: c.section || null, snippet: c.snippet, verified: true })
    }
    brief.what_they_want.forEach((s) => push('what_they_want', s)); brief.requirements.forEach((s) => push(`requirement:${s.category}`, s)); brief.defense_flags.forEach((s) => push(`defense:${s.flag}`, s))
    brief.potential_problems.forEach((s) => push('potential_problem', s)); brief.missing_information.forEach((s) => push('missing_information', s)); brief.next_steps.forEach((s) => push('next_step', s))
    if (facts.length) await session.supabase.from('extracted_facts').insert(facts)
    // Suggestions only. Items are created UNKNOWN; status is never touched here (UNKNOWN never becomes PASS).
    for (const t of template) await session.supabase.from('checklist_items').upsert({ company_id: session.companyId, company_opportunity_id: coId, group: t.group, key: t.key, label: t.label }, { onConflict: 'company_opportunity_id,key', ignoreDuplicates: true })
    for (const s of brief.checklist_suggestions) {
      await session.supabase.from('checklist_items').update({ ai_suggestion: { status: s.status, rationale: s.rationale.text, label: s.rationale.label, citations: s.rationale.citations, analysis_id: analysisId } }).eq('company_opportunity_id', coId).eq('key', s.key)
    }
    await session.supabase.from('activity_log').insert({ company_id: session.companyId, actor_id: session.user.id, entity_type: 'ai_analysis', entity_id: analysisId, opportunity_id: opportunityId, action: 'brief_generated', after: { model: res.model, cost_usd: res.costUsd, citation_rejections: stats.rejected } })
    return { analysisId, brief, stats, costUsd: res.costUsd, unparsed: input.unparsed.map((d) => d.file_name) }
  } catch (e) {
    if (e instanceof AiRefusalError || e instanceof AiOutputError) {
      await record(session, { companyOpportunityId: coId, kind: 'brief', model: env.AI_MODEL_BRIEF, usage: e instanceof AiOutputError ? e.usage : { input_tokens: 0, output_tokens: 0 }, cost: 0, status: 'error', error: e.message, sourceHash: input.hash }).catch(() => undefined)
    }
    throw e
  }
}

export async function runExtraction(session: Session, opportunityId: string) {
  await guard(session)
  const env = getEnv()
  const coId = await ensureCompanyOpportunity(session, opportunityId)
  const input = await loadInputs(session, opportunityId)
  if (input.docs.filter((d) => d.parse_status === 'parsed').length === 0) throw new HttpError(422, 'There are no parsed documents to extract from. Fetch or upload documents first.')
  const res = await callStructured({ client: client(), model: env.AI_MODEL_EXTRACT, schema: ExtractionSchema, system: SYSTEM_BASE, cachedContext: input.context, task: extractionTask(), effort: env.AI_EFFORT, fallback: env.AI_REFUSAL_FALLBACK === 'on' })
  const { extraction, stats } = processExtraction(res.data, buildIndex(input.all))
  const analysisId = await record(session, { companyOpportunityId: coId, kind: 'extraction', model: res.model, usage: res.usage, cost: res.costUsd, output: { extraction, citation_stats: stats }, rejections: stats.rejected, total: stats.total, sourceHash: input.hash, status: 'complete' })
  const rows = extraction.facts.flatMap((f) => (f.citations.length ? f.citations : [null]).map((c) => ({ company_id: session.companyId, analysis_id: analysisId, category: f.category, text: f.text, label: f.label, document_id: c && !c.documentId.startsWith('notice:') ? c.documentId : null, page: c?.page || null, section: c?.section || null, snippet: c?.snippet ?? null, verified: !!c })))
  if (rows.length) await session.supabase.from('extracted_facts').insert(rows)
  return { analysisId, extraction, stats, costUsd: res.costUsd }
}

export async function runAiSearch(session: Session, query: string): Promise<{ filters: SearchFilters; costUsd: number }> {
  await guard(session)
  const env = getEnv()
  const res = await callStructured({
    client: client(), model: env.AI_MODEL_SEARCH, schema: SearchFiltersSchema, effort: 'low', maxTokens: 4000, fallback: env.AI_REFUSAL_FALLBACK === 'on',
    system: `You translate a federal-contracting search request into structured filters for Fieldpoint's database. You never return opportunities. Only fill filters the request clearly implies; leave the rest empty/0. Color labels: GREEN = potential bid, YELLOW = research/watch, RED = awarded/not bid-ready. Notice type codes: o Solicitation, k Combined Synopsis/Solicitation, p Presolicitation, r Sources Sought, s Special Notice, a Award Notice, u Justification, i Intent to Bundle, g Surplus sale, dibbs_rfq DIBBS RFQ. If part of the request cannot be expressed with these filters (e.g. "things we could realistically source"), list it under unmapped and propose the closest filters under suggestions — do not pretend to filter on it.`,
    task: `Request: ${query}\nToday: ${new Date().toISOString().slice(0, 10)}`,
  })
  await record(session, { companyOpportunityId: null, kind: 'search', model: res.model, usage: res.usage, cost: res.costUsd, output: res.data, status: 'complete' })
  return { filters: res.data, costUsd: res.costUsd }
}

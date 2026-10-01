import { createHash } from 'node:crypto'
import type { DocumentIndex } from '@/lib/ai/citations'
import type { Company, Opportunity } from '@/lib/db-types'
import { fmtDeadline, fmtDate, orUnknown } from '@/lib/format'

/** Builds AI inputs from stored data only: the notice record (as a citable pseudo-document), documents, and the company profile. */

export const NOTICE_DOC_PREFIX = 'notice:'
export const isNoticeDocId = (id: string) => id.startsWith(NOTICE_DOC_PREFIX)

/** The stored SAM/DIBBS record rendered as text so claims about structured fields can be cited and machine-checked too. */
export function noticeDocument(o: Opportunity): DocumentIndex {
  const lines = [
    `Title: ${o.title}`,
    `Source: ${o.source === 'SAM' ? 'SAM.gov' : 'DLA DIBBS (imported by user)'}`,
    `Solicitation number: ${orUnknown(o.solicitation_number)}`,
    `Notice type: ${orUnknown(o.notice_type)}`,
    `Agency: ${orUnknown(o.full_parent_path ?? o.department)}`,
    `Posted date: ${fmtDate(o.posted_date)}`,
    `Response deadline: ${o.response_deadline ? fmtDeadline(o.response_deadline, o.response_deadline_raw, 'UTC') : 'Unknown'}${o.response_deadline_raw ? ` (as stored: ${o.response_deadline_raw})` : ''}`,
    `NAICS: ${orUnknown(o.naics)}`,
    `PSC: ${orUnknown(o.psc)}`,
    `Set-aside: ${orUnknown(o.set_aside ?? o.set_aside_code)}`,
    `Place of performance: ${[o.pop_city, o.pop_state, o.pop_zip, o.pop_country].filter(Boolean).join(', ') || 'Unknown'}`,
    `Active: ${o.active ? 'Yes' : 'No'}${o.cancelled ? ' (cancelled)' : ''}`,
    o.value_amount ? `Value (stated): ${o.value_amount}` : 'Value: Unknown',
  ]
  if (o.dibbs) for (const [k, v] of Object.entries(o.dibbs)) if (k !== 'missing' && v !== null && v !== undefined && v !== '') lines.push(`DIBBS ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  if (o.award) lines.push(`Award: ${JSON.stringify(o.award)}`)
  const desc = (o.description ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').trim()
  lines.push('', o.description_fetched_at || o.source === 'DIBBS' ? `Description:\n${desc || '(empty)'}` : 'Description: not yet retrieved from SAM.gov (it is fetched on demand).')
  return { documentId: `${NOTICE_DOC_PREFIX}${o.id}`, name: 'Stored notice record', pages: [{ page: 1, section: 'Notice record', pageReliable: false, text: lines.join('\n') }] }
}

/** Profile facts the AI may use. Deliberately excludes suppliers, quotes and pricing. */
export function profileForAi(c: Company): Record<string, unknown> {
  return {
    name: c.name, uei: c.uei, cage: c.cage, sam_status: c.sam_status, sam_expiration: c.sam_expiration,
    naics_codes: c.naics_codes, primary_naics: c.primary_naics, business_size: c.business_size, small_business_status: c.small_business_status,
    certifications: c.certifications, geographic_coverage: c.geographic_coverage, industries: c.industries,
    product_categories: c.product_categories, service_categories: c.service_categories,
    min_contract_size: c.min_contract_size, max_contract_size: c.max_contract_size, min_gross_margin: c.min_gross_margin,
    can_subcontract: c.can_subcontract, can_source_products: c.can_source_products, logistics: c.logistics, installation: c.installation,
    other_capabilities: c.other_capabilities, cmmc_level: c.cmmc_level, cmmc_date: c.cmmc_date, sprs_score: c.sprs_score, sprs_date: c.sprs_date,
    facility_clearance: c.facility_clearance, itar_registered: c.itar_registered, jcp_certified: c.jcp_certified,
  }
}

export function briefTask(c: Company, checklist: Array<{ key: string; label: string }>, today = new Date()): string {
  return `Today's date: ${today.toISOString().slice(0, 10)}

<company_profile>
${JSON.stringify(profileForAi(c), null, 2)}
</company_profile>

Checklist items you may suggest a status for (use these exact keys; skip any you cannot assess):
${checklist.map((i) => `- ${i.key}: ${i.label}`).join('\n')}

Produce the Pursuit Brief for the opportunity in the <document> blocks, following the schema exactly. Every defense flag in the schema must appear once. Use "Unknown" for any value the text does not state.`
}

export function extractionTask(): string {
  return `Extract the structured facts from the documents: statement of work, specifications, CLINs (number, description, quantity, unit), delivery schedule, period of performance, evaluation factors and basis of award, instructions to offerors, required forms (SF 1449, SF 33, SF 18, …), required certifications/representations, FAR/DFARS clauses (number + title), pricing instructions, questions deadline, submission method and address/portal, and any amendments and what they changed. Only include what the text actually says; cite verbatim.`
}

/** Hash of everything a brief was based on; if it changes later the UI asks the user whether to regenerate. */
export function sourceHash(o: Pick<Opportunity, 'content_hash' | 'description_fetched_at' | 'id'>, docChecksums: string[], descriptionLength: number): string {
  return createHash('sha256').update(JSON.stringify([o.id, o.content_hash, descriptionLength, [...docChecksums].sort()])).digest('hex')
}

/** Rough token estimate (≈4 chars/token) used to refuse oversize inputs instead of silently truncating them. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 4)
export const MAX_INPUT_TOKENS = 800_000

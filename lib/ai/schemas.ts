import { z } from 'zod'

/**
 * Output schemas. The Anthropic structured-output schema subset forbids numeric/string length
 * constraints, recursion, and caps optional/union parameters — so every field here is REQUIRED
 * and non-nullable (empty string / empty array / 0 mean "none"), and range rules are enforced by
 * post-processing, not by the schema.
 */
export const LabelSchema = z.enum(['VERIFIED', 'ANALYSIS', 'NEEDS_VERIFICATION'])

export const CitationSchema = z.object({
  documentId: z.string().describe('The id attribute of the <document> the snippet comes from'),
  page: z.number().int().describe('Page number from the [[page N]] marker; 0 when the document has no pages'),
  section: z.string().describe('Section heading, or sheet name / cell range for spreadsheets; empty string if none'),
  snippet: z.string().describe('A short VERBATIM quote (10-300 characters) copied exactly from that page/section'),
})

export const StatementSchema = z.object({
  text: z.string(),
  label: LabelSchema,
  citations: z.array(CitationSchema),
})

const item = <E extends z.ZodTypeAny, K extends string>(key: K, e: E) =>
  StatementSchema.extend({ [key]: e } as Record<K, E>)

export const PROVIDE_CATEGORIES = ['product_service', 'quantity', 'location', 'delivery_performance', 'personnel_equipment'] as const
export const DATE_KINDS = ['posted', 'questions_due', 'offers_due', 'period_of_performance', 'other'] as const
export const CONTRACT_FIELDS = ['agency', 'notice_type', 'naics', 'psc', 'set_aside', 'place_of_performance', 'contract_type', 'estimated_value'] as const
export const REQUIREMENT_CATEGORIES = ['certifications', 'licenses', 'past_performance', 'security_clearance', 'approved_source', 'domestic_sourcing', 'delivery', 'insurance_bonding', 'technical', 'other'] as const
export const DEFENSE_FLAGS = [
  'cmmc', 'dfars_7012_nist_800_171_sprs', 'itar_ear', 'berry_amendment', 'buy_american_taa', 'specialty_metals',
  'dpas_rating', 'first_article_testing', 'iuid_marking', 'military_packaging_marking', 'approved_source_qpl', 'wawf_invoicing',
] as const
export const DEFENSE_FLAG_LABELS: Record<(typeof DEFENSE_FLAGS)[number], string> = {
  cmmc: 'CMMC level',
  dfars_7012_nist_800_171_sprs: 'DFARS 252.204-7012 / NIST SP 800-171 / SPRS',
  itar_ear: 'ITAR / EAR export control',
  berry_amendment: 'Berry Amendment',
  buy_american_taa: 'Buy American / Trade Agreements Act',
  specialty_metals: 'Specialty metals (DFARS 252.225-7009)',
  dpas_rating: 'DPAS rating (DO / DX)',
  first_article_testing: 'First article testing',
  iuid_marking: 'IUID marking (MIL-STD-130)',
  military_packaging_marking: 'Military packaging / marking (MIL-STD-129, MIL-STD-2073)',
  approved_source_qpl: 'Approved source / QPL / source-controlled drawings',
  wawf_invoicing: 'Wide Area Workflow (WAWF) invoicing',
}
export const FLAG_STATUS = ['REQUIRED', 'NOT_MENTIONED', 'UNCLEAR'] as const
export const LEVELS = ['High', 'Medium', 'Low', 'Unknown'] as const

export const BriefSchema = z.object({
  what_they_want: z.array(StatementSchema).describe('2-4 plain-English sentences'),
  what_we_provide: z.array(item('category', z.enum(PROVIDE_CATEGORIES))),
  key_dates: z.array(item('kind', z.enum(DATE_KINDS)).extend({ value: z.string().describe('The date/time exactly as stated incl. time zone; empty string if not stated') })),
  contract_details: z.array(item('field', z.enum(CONTRACT_FIELDS)).extend({ value: z.string().describe('"Unknown" when not stated') })),
  requirements: z.array(item('category', z.enum(REQUIREMENT_CATEGORIES))),
  defense_flags: z.array(item('flag', z.enum(DEFENSE_FLAGS)).extend({ status: z.enum(FLAG_STATUS) })),
  potential_problems: z.array(StatementSchema),
  missing_information: z.array(StatementSchema),
  next_steps: z.array(StatementSchema),
  fit: z.object({
    ai_fit: z.enum(LEVELS),
    fit_rationale: z.string(),
    complexity: z.enum(LEVELS),
    complexity_rationale: z.string(),
  }),
  checklist_suggestions: z.array(z.object({
    key: z.string(),
    status: z.enum(['PASS', 'FAIL', 'UNKNOWN', 'NA']),
    rationale: StatementSchema,
  })),
})
export type RawBrief = z.infer<typeof BriefSchema>

export const FACT_CATEGORIES = [
  'statement_of_work', 'specification', 'quantity', 'delivery_schedule', 'period_of_performance', 'evaluation_basis',
  'evaluation_factor', 'instructions_to_offerors', 'required_form', 'required_certification', 'pricing_instructions',
  'questions_deadline', 'submission_method', 'amendment_change',
] as const

export const ExtractionSchema = z.object({
  facts: z.array(item('category', z.enum(FACT_CATEGORIES))),
  clins: z.array(z.object({
    number: z.string(), description: z.string(), quantity: z.string().describe('As stated; empty string if not stated'), unit: z.string(),
    citation: CitationSchema,
  })),
  clauses: z.array(z.object({ number: z.string().describe('e.g. 52.212-1 or 252.225-7009'), title: z.string(), citation: CitationSchema })),
  basis_of_award: z.enum(['LPTA', 'BEST_VALUE', 'OTHER', 'UNKNOWN']),
})
export type RawExtraction = z.infer<typeof ExtractionSchema>

/** Natural-language search → structured filters (spec §7.3). The AI never returns result rows. */
export const SearchFiltersSchema = z.object({
  keywords: z.string().describe('Free-text keywords; empty string if none'),
  departments: z.array(z.string()),
  naics: z.array(z.string()),
  psc: z.array(z.string()),
  set_asides: z.array(z.string()).describe('SAM set-aside codes e.g. SBA, 8A, HZC, SDVOSBC, WOSB'),
  states: z.array(z.string()).describe('Two-letter state codes'),
  notice_type_codes: z.array(z.enum(['o', 'k', 'p', 'r', 's', 'a', 'u', 'i', 'g', 'dibbs_rfq'])),
  color_labels: z.array(z.enum(['GREEN', 'YELLOW', 'RED'])),
  source: z.enum(['SAM', 'DIBBS', 'ANY']),
  active_only: z.boolean(),
  posted_within_days: z.number().int().describe('0 = no limit'),
  deadline_within_days: z.number().int().describe('0 = no limit'),
  value_max: z.number().describe('0 = no limit'),
  value_min: z.number().describe('0 = no limit'),
  unmapped: z.array(z.string()).describe('Parts of the request that cannot be expressed as a filter'),
  suggestions: z.array(z.string()).describe('Closest available filters for the unmapped parts'),
})
export type SearchFilters = z.infer<typeof SearchFiltersSchema>

/** Convert a Zod schema to the subset of JSON Schema the structured-output API accepts. */
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'maxProperties', 'minProperties', '$schema', 'format', 'pattern', 'default', 'examples', 'title'])
export function toApiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { target: 'draft-7', io: 'output' }) as Record<string, unknown>
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk)
    if (n && typeof n === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (UNSUPPORTED.has(k) && typeof v !== 'object') continue
        if (k === 'minItems' && typeof v === 'number' && v > 1) continue
        o[k] = walk(v)
      }
      if (o.type === 'object' && !('additionalProperties' in o)) o.additionalProperties = false
      return o
    }
    return n
  }
  return walk(raw) as Record<string, unknown>
}

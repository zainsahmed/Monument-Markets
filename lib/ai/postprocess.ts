import { checkStatement, emptyStats, type CheckStats, type CitationIndex, type Label, type Statement } from './citations'
import { DEFENSE_FLAGS, DEFENSE_FLAG_LABELS, type RawBrief, type RawExtraction } from './schemas'

/**
 * Turns the model's raw (schema-valid) output into what the UI may render:
 *  - every citation is machine-verified, failed ones removed, unsupported VERIFIED downgraded
 *  - absence claims can never be VERIFIED
 *  - fit/complexity rationales are always ANALYSIS
 *  - all 12 defense flags are present (missing ones become UNCLEAR / NEEDS_VERIFICATION)
 *  - checklist suggestions are only ever suggestions (never PASS from nothing)
 */
export interface Brief extends Omit<RawBrief, 'fit' | 'checklist_suggestions'> {
  fit: { ai_fit: RawBrief['fit']['ai_fit']; fit_rationale: Statement; complexity: RawBrief['fit']['complexity']; complexity_rationale: Statement }
  checklist_suggestions: Array<{ key: string; status: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NA'; rationale: Statement }>
}

/** Enum casing can drift; compare case-insensitively before Zod validation. */
export function normaliseLabels<T>(raw: T): T {
  const walk = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(walk)
    if (n && typeof n === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k === 'label' && typeof v === 'string') {
          const up = v.trim().toUpperCase().replace(/[\s-]+/g, '_')
          o[k] = up === 'VERIFIED_FROM_SOLICITATION' ? 'VERIFIED' : up === 'AI_ANALYSIS' ? 'ANALYSIS' : up
        } else if ((k === 'status') && typeof v === 'string' && /^(required|not_mentioned|unclear|pass|fail|unknown|na)$/i.test(v)) o[k] = v.toUpperCase()
        else o[k] = walk(v)
      }
      return o
    }
    return n
  }
  return walk(raw) as T
}

function chk(s: Statement, idx: CitationIndex, stats: CheckStats, forceLabel?: Label): Statement {
  const out = checkStatement(s, idx, stats)
  return forceLabel ? { ...out, label: forceLabel } : out
}

export function processBrief(raw: RawBrief, idx: CitationIndex, checklistKeys: string[]): { brief: Brief; stats: CheckStats } {
  const stats = emptyStats()
  const mapStatements = <T extends Statement>(arr: T[]): T[] => arr.map((x) => ({ ...x, ...chk(x, idx, stats) }))

  const flags = mapStatements(raw.defense_flags).map((f) =>
    f.status !== 'REQUIRED' && f.label === 'VERIFIED' ? { ...f, label: 'NEEDS_VERIFICATION' as const, citations: f.citations } : f)
  const seen = new Set(flags.map((f) => f.flag))
  for (const flag of DEFENSE_FLAGS) {
    if (!seen.has(flag)) flags.push({ flag, status: 'UNCLEAR', text: `${DEFENSE_FLAG_LABELS[flag]}: the analysis did not assess this item — check the solicitation.`, label: 'NEEDS_VERIFICATION', citations: [] })
  }
  flags.sort((a, b) => DEFENSE_FLAGS.indexOf(a.flag) - DEFENSE_FLAGS.indexOf(b.flag))

  const allowed = new Set(checklistKeys)
  const suggestions = raw.checklist_suggestions
    .filter((s) => allowed.has(s.key))
    .map((s) => ({ key: s.key, status: s.status, rationale: chk(s.rationale, idx, stats) }))

  const brief: Brief = {
    what_they_want: mapStatements(raw.what_they_want),
    what_we_provide: mapStatements(raw.what_we_provide),
    key_dates: mapStatements(raw.key_dates).map((d) => ({ ...d, value: d.value.trim() || 'Unknown' })),
    contract_details: mapStatements(raw.contract_details).map((d) => ({ ...d, value: d.value.trim() || 'Unknown' })),
    requirements: mapStatements(raw.requirements),
    defense_flags: flags,
    potential_problems: mapStatements(raw.potential_problems),
    missing_information: mapStatements(raw.missing_information),
    next_steps: mapStatements(raw.next_steps),
    fit: {
      ai_fit: raw.fit.ai_fit,
      fit_rationale: { text: raw.fit.fit_rationale, label: 'ANALYSIS', citations: [] },
      complexity: raw.fit.complexity,
      complexity_rationale: { text: raw.fit.complexity_rationale, label: 'ANALYSIS', citations: [] },
    },
    checklist_suggestions: suggestions,
  }
  return { brief, stats }
}

export interface Extraction extends Omit<RawExtraction, 'clins' | 'clauses'> {
  clins: Array<Omit<RawExtraction['clins'][number], 'citation'> & { citation: Statement['citations'][number] | null; verified: boolean }>
  clauses: Array<Omit<RawExtraction['clauses'][number], 'citation'> & { citation: Statement['citations'][number] | null; verified: boolean }>
}

export function processExtraction(raw: RawExtraction, idx: CitationIndex): { extraction: Extraction; stats: CheckStats } {
  const stats = emptyStats()
  const facts = raw.facts.map((f) => ({ ...f, ...checkStatement(f, idx, stats) }))
  const verifyOne = <T extends { citation: Statement['citations'][number] }>(x: T) => {
    const r = checkStatement({ text: '', label: 'VERIFIED', citations: [x.citation] }, idx, stats)
    return { ...x, citation: r.citations[0] ?? null, verified: r.label === 'VERIFIED' }
  }
  return {
    extraction: { facts, clins: raw.clins.map(verifyOne), clauses: raw.clauses.map(verifyOne), basis_of_award: raw.basis_of_award },
    stats,
  }
}

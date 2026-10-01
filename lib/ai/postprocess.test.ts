import { describe, expect, it } from 'vitest'
import { buildIndex } from './citations'
import { normaliseLabels, processBrief, processExtraction } from './postprocess'
import { BriefSchema, DEFENSE_FLAGS, type RawBrief } from './schemas'

const idx = buildIndex([{ documentId: 'd1', name: 'RFQ.pdf', pages: [{ page: 3, section: 'Section F', pageReliable: true, text: 'Delivery within 90 days ARO. First article testing is required.' }] }])
const good = { documentId: 'd1', page: 3, section: 'Section F', snippet: 'First article testing is required' }
const st = (text: string, label: 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION', citations = [] as typeof good[]) => ({ text, label, citations })

const raw = (over: Partial<RawBrief> = {}): RawBrief => ({
  what_they_want: [st('Buy pumps', 'ANALYSIS')],
  what_we_provide: [], key_dates: [{ ...st('Offers due', 'NEEDS_VERIFICATION'), kind: 'offers_due', value: '  ' }],
  contract_details: [], requirements: [{ ...st('FAT', 'VERIFIED', [good]), category: 'technical' }],
  defense_flags: [{ ...st('FAT required', 'VERIFIED', [good]), flag: 'first_article_testing', status: 'REQUIRED' }, { ...st('No Berry text', 'VERIFIED', [good]), flag: 'berry_amendment', status: 'NOT_MENTIONED' }],
  potential_problems: [], missing_information: [], next_steps: [],
  fit: { ai_fit: 'Medium', fit_rationale: 'ok', complexity: 'Low', complexity_rationale: 'simple' },
  checklist_suggestions: [{ key: 'sam_registration', status: 'PASS', rationale: st('Profile says active', 'VERIFIED') }, { key: 'made_up_key', status: 'PASS', rationale: st('x', 'ANALYSIS') }],
  ...over,
})

describe('processBrief', () => {
  it('verifies citations and keeps supported VERIFIED statements', () => {
    const { brief, stats } = processBrief(raw(), idx, ['sam_registration'])
    expect(brief.requirements[0].label).toBe('VERIFIED')
    expect(brief.requirements[0].citations).toHaveLength(1)
    expect(stats.rejected).toBe(0)
  })
  it('downgrades VERIFIED claims with fabricated citations and logs rejections', () => {
    const fake = { ...good, snippet: 'Offerors shall hold a Top Secret facility clearance' }
    const { brief, stats } = processBrief(raw({ requirements: [{ ...st('TS', 'VERIFIED', [fake]), category: 'security_clearance' }] }), idx, [])
    expect(brief.requirements[0].label).toBe('NEEDS_VERIFICATION')
    expect(brief.requirements[0].citations).toEqual([])
    expect(stats.rejected).toBe(1)
    expect(stats.downgraded).toBeGreaterThanOrEqual(1)
  })
  it('never lets an absence claim stay VERIFIED', () => {
    const { brief } = processBrief(raw(), idx, [])
    expect(brief.defense_flags.find((f) => f.flag === 'berry_amendment')!.label).toBe('NEEDS_VERIFICATION')
    expect(brief.defense_flags.find((f) => f.flag === 'first_article_testing')!.label).toBe('VERIFIED')
  })
  it('always returns all defense flags; unassessed ones are UNCLEAR + NEEDS_VERIFICATION', () => {
    const { brief } = processBrief(raw(), idx, [])
    expect(brief.defense_flags.map((f) => f.flag)).toEqual([...DEFENSE_FLAGS])
    const cmmc = brief.defense_flags.find((f) => f.flag === 'cmmc')!
    expect(cmmc).toMatchObject({ status: 'UNCLEAR', label: 'NEEDS_VERIFICATION' })
  })
  it('fills "Unknown" for blank values and forces ANALYSIS on fit rationales', () => {
    const { brief } = processBrief(raw(), idx, [])
    expect(brief.key_dates[0].value).toBe('Unknown')
    expect(brief.fit.fit_rationale.label).toBe('ANALYSIS')
    expect(brief.fit.complexity_rationale.label).toBe('ANALYSIS')
  })
  it('keeps only suggestions for real checklist keys and downgrades unsupported VERIFIED rationale', () => {
    const { brief } = processBrief(raw(), idx, ['sam_registration'])
    expect(brief.checklist_suggestions.map((s) => s.key)).toEqual(['sam_registration'])
    expect(brief.checklist_suggestions[0].rationale.label).toBe('NEEDS_VERIFICATION')
  })
})

describe('schema + label normalisation', () => {
  it('accepts casing drift via normaliseLabels before validation', () => {
    const drifted = normaliseLabels(JSON.parse(JSON.stringify(raw()).replace(/"VERIFIED"/g, '"verified"').replace(/"ANALYSIS"/g, '"AI Analysis"')))
    expect(BriefSchema.safeParse(drifted).success).toBe(true)
  })
  it('rejects structurally invalid output (so it is never partially rendered)', () => {
    expect(BriefSchema.safeParse({ what_they_want: 'nope' }).success).toBe(false)
  })
})

describe('processExtraction', () => {
  it('verifies CLIN and clause citations independently', () => {
    const { extraction, stats } = processExtraction({
      facts: [{ ...st('FAT', 'VERIFIED', [good]), category: 'specification' }],
      clins: [
        { number: '0001', description: 'Pump', quantity: '40', unit: 'EA', citation: good },
        { number: '0002', description: 'Ghost', quantity: '1', unit: 'EA', citation: { ...good, snippet: 'CLIN 0002 ghost item that does not exist' } },
      ],
      clauses: [{ number: '52.212-1', title: 'Instructions', citation: { ...good, snippet: 'not on this page at all really' } }],
      basis_of_award: 'UNKNOWN',
    }, idx)
    expect(extraction.clins.map((c) => c.verified)).toEqual([true, false])
    expect(extraction.clauses[0].verified).toBe(false)
    expect(stats.rejected).toBe(2)
  })
})

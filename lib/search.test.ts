import { describe, expect, it } from 'vitest'
import { applyFilters, emptyFilters, filterChips, fromAiFilters, FiltersSchema, type QueryLike } from './search'

class Rec implements QueryLike<Rec> {
  calls: Array<[string, string, unknown]> = []
  private rec = (op: string, col: string, v: unknown) => { this.calls.push([op, col, v]); return this }
  eq(c: string, v: unknown) { return this.rec('eq', c, v) } in(c: string, v: unknown[]) { return this.rec('in', c, v) }
  gte(c: string, v: unknown) { return this.rec('gte', c, v) } lte(c: string, v: unknown) { return this.rec('lte', c, v) }
  ilike(c: string, v: string) { return this.rec('ilike', c, v) } or(f: string) { return this.rec('or', 'or', f) }
}

describe('applyFilters', () => {
  it('does nothing for empty filters', () => {
    expect(applyFilters(new Rec(), emptyFilters()).calls).toEqual([])
  })
  it('maps tabs to colour labels', () => {
    expect(applyFilters(new Rec(), FiltersSchema.parse({ tab: 'bid_ready' })).calls).toEqual([['eq', 'color_label', 'GREEN']])
    expect(applyFilters(new Rec(), FiltersSchema.parse({ tab: 'watch' })).calls[0][2]).toBe('YELLOW')
    expect(applyFilters(new Rec(), FiltersSchema.parse({ tab: 'awarded' })).calls[0][2]).toBe('RED')
  })
  it('applies list, range and boolean filters', () => {
    const f = FiltersSchema.parse({ naics: ['336413'], departments: ['DEPT OF DEFENSE'], states: ['AL'], active: true, deadlineTo: '2026-12-01', valueMax: 500000, zip: '35%_8' })
    const c = applyFilters(new Rec(), f).calls
    expect(c).toContainEqual(['in', 'naics', ['336413']])
    expect(c).toContainEqual(['in', 'pop_state', ['AL']])
    expect(c).toContainEqual(['eq', 'active', true])
    expect(c).toContainEqual(['lte', 'response_deadline', '2026-12-01T23:59:59Z'])
    expect(c).toContainEqual(['lte', 'value_amount', 500000])
    expect(c).toContainEqual(['ilike', 'pop_zip', '358%']) // wildcard characters in user input are stripped
  })
})

describe('chips + AI filter conversion', () => {
  it('renders readable chips', () => {
    const chips = filterChips(FiltersSchema.parse({ departments: ['Dept of Defense'], valueMax: 500000, active: true }))
    expect(chips.map((c) => `${c.label}: ${c.value}`)).toEqual(['Agency: Dept of Defense', 'Status: Active', 'Value: < $500,000'])
  })
  it('converts AI output, treating 0 as unset and surfacing nothing it cannot map', () => {
    const f = fromAiFilters({
      keywords: 'pump', departments: ['Dept of Defense'], naics: [], psc: [], set_asides: ['SBA'], states: ['al'], notice_type_codes: ['o', 'k'],
      color_labels: ['GREEN'], source: 'ANY', active_only: true, posted_within_days: 30, deadline_within_days: 0, value_max: 500000, value_min: 0,
      unmapped: ['things we could realistically source'], suggestions: ['Filter by NAICS you hold'],
    }, new Date('2026-10-01T00:00:00Z'))
    expect(f).toMatchObject({ q: 'pump', tab: 'bid_ready', source: undefined, states: ['AL'], active: true, postedFrom: '2026-09-01', valueMax: 500000, valueMin: undefined, deadlineFrom: undefined })
  })
})

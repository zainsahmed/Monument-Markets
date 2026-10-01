import { describe, expect, it } from 'vitest'
import { buildStrategies, keywordsFromTitle, lookupHistoricalAwards, summarizeAwards, timePeriod, toToptierAgency } from './index'

describe('agency + keyword mapping', () => {
  it('maps SAM department names to USAspending toptier names', () => {
    expect(toToptierAgency('DEPT OF DEFENSE')).toBe('Department of Defense')
    expect(toToptierAgency('DEPT OF ENERGY')).toBe('Department of Energy')
    expect(toToptierAgency('VETERANS AFFAIRS, DEPARTMENT OF')).toBe('Department of Veterans Affairs')
    expect(toToptierAgency('GENERAL SERVICES ADMINISTRATION')).toBe('General Services Administration')
    expect(toToptierAgency(null)).toBeNull()
  })
  it('extracts distinctive keywords', () => {
    expect(keywordsFromTitle('Hydraulic Pump Assembly, P/N 1234-56 for the Army Services')).toEqual(['hydraulic', 'pump', 'assembly'])
  })
  it('looks back five fiscal years', () => {
    expect(timePeriod(new Date('2026-10-01T00:00:00Z'))).toEqual([{ start_date: '2022-10-01', end_date: '2027-09-30' }])
    expect(timePeriod(new Date('2026-03-01T00:00:00Z'))).toEqual([{ start_date: '2021-10-01', end_date: '2026-09-30' }])
  })
})

describe('strategies', () => {
  it('builds up to three, skipping those lacking inputs', () => {
    const all = buildStrategies({ title: 'Hydraulic pump assembly', naics: '336413', psc: '1560', department: 'DEPT OF DEFENSE' })
    expect(all.map((s) => s.name)).toEqual(['naics_psc', 'naics_agency', 'keyword'])
    expect(buildStrategies({ title: 'x', naics: null, psc: null, department: null })).toEqual([])
    expect(buildStrategies({ title: 'Hydraulic pump', naics: '336413', psc: null, department: null }).map((s) => s.name)).toEqual(['keyword'])
  })
})

const row = (id: string, amount: number | null) => ({ 'Award ID': id, 'Recipient Name': 'ACME', 'Award Amount': amount, 'Start Date': '2024-01-02', 'Awarding Agency': 'Department of Defense', NAICS: { code: '336413' }, PSC: { code: '1560' }, generated_internal_id: `CONT_${id}` })

describe('lookupHistoricalAwards', () => {
  it('merges and dedupes across strategies, recording which matched, and tolerates a failing strategy', async () => {
    let n = 0
    const fetchImpl = (async () => {
      n++
      if (n === 1) return new Response(JSON.stringify({ results: [row('A1', 100), row('A2', null)], page_metadata: { hasNext: false } }), { status: 200 })
      if (n === 2) return new Response('boom', { status: 500 })
      return new Response(JSON.stringify({ results: [row('A1', 100), row('A3', 300)], page_metadata: { hasNext: false } }), { status: 200 })
    }) as typeof fetch
    const r = await lookupHistoricalAwards({ title: 'Hydraulic pump assembly', naics: '336413', psc: '1560', department: 'DEPT OF DEFENSE' }, { fetchImpl })
    expect(r.awards.map((a) => a.award_id).sort()).toEqual(['A1', 'A2', 'A3'])
    expect(r.awards.find((a) => a.award_id === 'A1')!.matched_by).toEqual(['naics_psc', 'keyword'])
    expect(r.strategies.map((s) => [s.name, s.count, !!s.error])).toEqual([['naics_psc', 2, false], ['naics_agency', 0, true], ['keyword', 2, false]])
    expect(r.awards[0].usaspending_url).toBe('https://www.usaspending.gov/award/CONT_A1')
  })
})

describe('summarizeAwards', () => {
  it('uses known amounts only', () => {
    expect(summarizeAwards([{ amount: 100 }, { amount: 300 }, { amount: null }, { amount: 200 }])).toEqual({ count: 4, withAmount: 3, median: 200, min: 100, max: 300 })
    expect(summarizeAwards([{ amount: null }])).toEqual({ count: 1, withAmount: 0, median: null, min: null, max: null })
    expect(summarizeAwards([{ amount: 100 }, { amount: 300 }]).median).toBe(200)
  })
})

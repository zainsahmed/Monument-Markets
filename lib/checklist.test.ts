import { describe, expect, it } from 'vitest'
import { applyAiSuggestion, DEFAULT_TEMPLATE, GROUPS, profileSuggestions, summarizeChecklist } from './checklist'

describe('template', () => {
  it('covers every item in the spec, grouped, with unique keys', () => {
    expect(DEFAULT_TEMPLATE).toHaveLength(32)
    expect(new Set(DEFAULT_TEMPLATE.map((i) => i.key)).size).toBe(32)
    for (const g of GROUPS) expect(DEFAULT_TEMPLATE.some((i) => i.group === g)).toBe(true)
  })
})
describe('summary', () => {
  it('says what is unknown/failed in plain language, with no score', () => {
    const s = summarizeChecklist([...Array(3).fill({ status: 'UNKNOWN' }), { status: 'FAIL' }, { status: 'PASS' }])
    expect(s.statement).toBe('3 items unknown, 1 failed — not ready.')
    expect(s).toMatchObject({ pass: 1, fail: 1, unknown: 3, ready: false })
    expect(Object.keys(s)).not.toContain('score')
  })
  it('is ready only when nothing is unknown or failed', () => {
    expect(summarizeChecklist([{ status: 'PASS' }, { status: 'NA' }]).ready).toBe(true)
    expect(summarizeChecklist([]).ready).toBe(false)
  })
})
describe('UNKNOWN never becomes PASS', () => {
  it('applying an AI suggestion leaves the status untouched', () => {
    expect(applyAiSuggestion('UNKNOWN', 'PASS')).toBe('UNKNOWN')
  })
  it('profile-derived suggestions are suggestions only and handle expiry vs deadline', () => {
    const now = new Date('2026-10-01T00:00:00Z')
    const ok = profileSuggestions({ sam_status: 'active', sam_expiration: '2027-03-01', sprs_date: '2026-01-01', sprs_score: 88, cmmc_level: null }, new Date('2026-10-20T00:00:00Z'), now)
    expect(ok.sam_registration.status).toBe('PASS')
    const expired = profileSuggestions({ sam_status: 'active', sam_expiration: '2026-10-10', sprs_date: null, sprs_score: null, cmmc_level: null }, new Date('2026-10-20T00:00:00Z'), now)
    expect(expired.sam_registration.status).toBe('FAIL')
    expect(expired.sprs_score).toBeUndefined()
    expect(profileSuggestions({ sam_status: null, sam_expiration: null, sprs_date: '2020-01-01', sprs_score: 50, cmmc_level: null }, null, now).sprs_score.status).toBe('FAIL')
  })
})

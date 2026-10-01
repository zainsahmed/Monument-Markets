import { describe, expect, it } from 'vitest'
import { dashboardMetrics, dashboardPanels, stageCounts, type TrackedRow } from './dashboard-calc'

const now = new Date('2026-10-01T12:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 864e5).toISOString()
const row = (o: Partial<TrackedRow>): TrackedRow => ({ coId: 'c', oppId: 'o', title: 't', department: null, deadline: day(10), color: 'GREEN', active: true, value: null, workflow: 'none', stage: null, saved: false, aiFit: null, ...o })

describe('metrics', () => {
  it('sums only known values and counts the unknown ones', () => {
    const m = dashboardMetrics([row({ workflow: 'pursue', value: 100_000 }), row({ stage: 'pricing', value: 50_000 }), row({ stage: 'sourcing', value: null }), row({ stage: 'new', value: 999 }), row({ workflow: 'pass', value: 5 })], now)
    expect(m.beingPursued).toBe(3)
    expect(m.potentialValue).toBe(150_000)
    expect(m.unknownValueCount).toBe(1)
  })
  it('never treats unknown as zero or invents a value', () => {
    const m = dashboardMetrics([row({ workflow: 'pursue', value: null })], now)
    expect(m.potentialValue).toBe(0)
    expect(m.unknownValueCount).toBe(1)
  })
  it('counts tracked deadlines in the next 7 days, excluding passed and finished', () => {
    const m = dashboardMetrics([row({ saved: true, deadline: day(3) }), row({ stage: 'sourcing', deadline: day(7) }), row({ saved: true, deadline: day(8) }), row({ saved: true, deadline: day(-1) }), row({ stage: 'won', deadline: day(2) }), row({ workflow: 'pass', saved: true, deadline: day(2) }), row({ deadline: day(2) })], now)
    expect(m.deadlines7).toBe(2)
  })
})
describe('panels', () => {
  it('routes rows into the right panels, soonest deadline first', () => {
    const p = dashboardPanels([
      row({ coId: 'a', workflow: 'review', deadline: day(9) }), row({ coId: 'b', stage: 'reviewing', deadline: day(2) }),
      row({ coId: 'c', stage: 'sourcing' }), row({ coId: 'd', stage: 'ready_to_bid' }), row({ coId: 'e', stage: 'submitted' }), row({ coId: 'f', stage: 'won' }),
      row({ coId: 'g', stage: 'lost_passed' }), row({ coId: 'h', workflow: 'pass' }), row({ coId: 'i', aiFit: 'High', saved: true, deadline: day(5) }),
    ], now)
    expect(p.needsReview.map((r) => r.coId)).toEqual(['b', 'a'])
    expect(p.sourcing.map((r) => r.coId)).toEqual(['c'])
    expect(p.ready.map((r) => r.coId)).toEqual(['d'])
    expect(p.submitted.map((r) => r.coId)).toEqual(['e'])
    expect(p.won.map((r) => r.coId)).toEqual(['f'])
    expect(p.lostPassed.map((r) => r.coId).sort()).toEqual(['g', 'h'])
    expect(p.highPriority.map((r) => r.coId)).toEqual(['i'])
    expect(p.deadlines.map((r) => r.coId)).toEqual(['b', 'i', 'c', 'd'])
  })
  it('stage counts cover all nine stages', () => {
    const c = stageCounts([{ stage: 'new' }, { stage: 'new' }, { stage: 'won' }, { stage: null }])
    expect(c).toHaveLength(9)
    expect(c[0]).toMatchObject({ key: 'new', count: 2 })
    expect(c.find((x) => x.key === 'won')!.count).toBe(1)
  })
})

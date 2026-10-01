import { describe, expect, it } from 'vitest'
import { planDeadlineAlerts, renderDigest } from './alerts'
import { countdownTone, daysLeft, fmtDeadline, orUnknown } from './format'

const now = new Date('2026-10-01T12:00:00Z')
const base = { userId: 'u1', companyId: 'c1', opportunityId: 'o1', title: 'Pumps', offsets: [7, 3, 1] }
const inDays = (n: number) => new Date(now.getTime() + n * 864e5 - 3600e3).toISOString()

describe('deadline alerts', () => {
  it('fires the tightest reached offset only', () => {
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(20) }], now)).toHaveLength(0)
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(6) }], now)[0].payload.offset).toBe(7)
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(2) }], now)[0].payload.offset).toBe(3)
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(0.5) }], now)[0].payload.offset).toBe(1)
  })
  it('does not alert for past deadlines', () => {
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(-1) }], now)).toHaveLength(0)
  })
  it('dedupe key is stable per offset and re-arms when the deadline changes', () => {
    const a = planDeadlineAlerts([{ ...base, deadline: inDays(2) }], now)[0].dedupeKey
    const again = planDeadlineAlerts([{ ...base, deadline: inDays(2) }], new Date(now.getTime() + 3600e3))[0].dedupeKey
    expect(again).toBe(a)
    expect(planDeadlineAlerts([{ ...base, deadline: inDays(3) }], now)[0].dedupeKey).not.toBe(a)
  })
  it('honours custom offsets', () => {
    expect(planDeadlineAlerts([{ ...base, offsets: [14], deadline: inDays(10) }], now)[0].payload.offset).toBe(14)
  })
})
describe('digest', () => {
  it('escapes HTML in titles', () => {
    const d = renderDigest([{ title: '<script>alert(1)</script>', type: 'amendment', link: '/opportunities/1', created_at: '' }], 'https://x.test')
    expect(d.html).not.toContain('<script>')
    expect(d.text).toContain('https://x.test/opportunities/1')
  })
})
describe('countdown + formatting', () => {
  it('uses the spec thresholds', () => {
    expect(countdownTone(30)).toBe('neutral'); expect(countdownTone(15)).toBe('neutral')
    expect(countdownTone(14)).toBe('yellow'); expect(countdownTone(4)).toBe('yellow')
    expect(countdownTone(3)).toBe('red'); expect(countdownTone(1)).toBe('red')
    expect(countdownTone(-2)).toBe('past'); expect(countdownTone(null)).toBe('none')
  })
  it('days left rounds up and handles missing', () => {
    expect(daysLeft('2026-10-02T11:00:00Z', now)).toBe(1)
    expect(daysLeft(null, now)).toBeNull()
    expect(daysLeft('2026-09-29T12:00:00Z', now)).toBeLessThan(0)
  })
  it('shows Unknown instead of blank', () => {
    expect(orUnknown(null)).toBe('Unknown'); expect(orUnknown('')).toBe('Unknown'); expect(orUnknown(0)).toBe('0')
    expect(fmtDeadline(null, null)).toBe('Unknown')
  })
  it('notes original zone and missing time-of-day', () => {
    expect(fmtDeadline('2026-10-20T18:00:00.000Z', '2026-10-20T14:00:00-04:00', 'America/New_York')).toBe('Oct 20, 2026, 2:00 PM EDT · posted as UTC-04:00')
    expect(fmtDeadline('2026-10-06T03:59:59.000Z', '2026-10-05', 'UTC')).toBe('Oct 5, 2026 (time not stated)')
  })
})

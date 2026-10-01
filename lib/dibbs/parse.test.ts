import { describe, expect, it } from 'vitest'
import { dibbsToOpportunity, parseDate, parseDibbsRfq } from './parse'

// Test fixture shaped like a DIBBS RFQ (synthetic; not shipped in the app).
const FULL = `
RFQ NO: SPE7M1-26-T-0412
ISSUE DATE: 09-24-2026
RETURN BY: 10-15-2026
NSN/PART: 4320-01-234-5678
NOMENCLATURE: PUMP,ROTARY
PART NUMBER: 1234-56  CAGE 1ABC2
QTY: 40  UI: EA
DELIVERY: 90 DAYS ARO
REQUIRED DELIVERY DATE: 01/15/2027
FOB: Destination
PACKAGING: MIL-STD-2073-1 Level A, MIL-STD-129 marking
SET-ASIDE: Small Business
APPROVED SOURCE: CAGE 1ABC2 P/N 1234-56
APPROVED SOURCE: CAGE 9ZZ88 P/N 98-7654
`

describe('parseDate', () => {
  it('handles the common DIBBS/DoD date shapes', () => {
    expect(parseDate('10-15-2026')).toBe('2026-10-15')
    expect(parseDate('1/5/2027')).toBe('2027-01-05')
    expect(parseDate('2026-10-15')).toBe('2026-10-15')
    expect(parseDate('15 OCT 2026')).toBe('2026-10-15')
    expect(parseDate('Oct 5, 2026')).toBe('2026-10-05')
    expect(parseDate('soon')).toBeNull()
  })
})

describe('parseDibbsRfq', () => {
  it('extracts the fields present in the RFQ', () => {
    const r = parseDibbsRfq(FULL)
    expect(r).toMatchObject({
      rfq_number: 'SPE7M1-26-T-0412', nsn: '4320-01-234-5678', fsc: '4320', nomenclature: 'PUMP,ROTARY', part_number: '1234-56',
      quantity: 40, unit_of_issue: 'EA', delivery_days: 90, required_delivery_date: '2027-01-15', issue_date: '2026-09-24', close_date: '2026-10-15', fob: 'Destination',
    })
    expect(r.approved_sources).toEqual([{ cage: '1ABC2', part_number: '1234-56' }, { cage: '9ZZ88', part_number: '98-7654' }])
    expect(r.packaging).toMatch(/MIL-STD-2073/)
    expect(r.missing).toEqual([])
  })
  it('reports what is missing instead of guessing', () => {
    const r = parseDibbsRfq('NSN: 5310-00-123-4567\nQTY: 500')
    expect(r.nsn).toBe('5310-00-123-4567')
    expect(r.quantity).toBe(500)
    expect(r.rfq_number).toBeNull()
    expect(r.close_date).toBeNull()
    expect(r.delivery_days).toBeNull()
    expect(r.missing).toEqual(expect.arrayContaining(['RFQ number', 'Close date', 'Delivery days', 'Packaging', 'Approved sources / CAGE']))
  })
  it('never invents an NSN from unrelated digits', () => {
    expect(parseDibbsRfq('Call 555-1234 or order 12345').nsn).toBeNull()
  })
})

describe('dibbsToOpportunity', () => {
  it('maps to the opportunity model as a DIBBS RFQ with FSC as PSC', () => {
    const o = dibbsToOpportunity(parseDibbsRfq(FULL), FULL)
    expect(o).toMatchObject({ source: 'DIBBS', notice_id: 'SPE7M1-26-T-0412', notice_type_code: 'dibbs_rfq', psc: '4320', naics: null, department: 'Defense Logistics Agency' })
    expect(o.title).toBe('PUMP,ROTARY — NSN 4320-01-234-5678')
    expect(o.response_deadline).toBeTruthy()
    expect(o.dibbs.approved_sources).toHaveLength(2)
  })
  it('gives RFQs without a number a stable derived id', () => {
    const a = dibbsToOpportunity(parseDibbsRfq('NSN: 5310-00-123-4567'), 'NSN: 5310-00-123-4567')
    const b = dibbsToOpportunity(parseDibbsRfq('NSN: 5310-00-123-4567'), 'NSN: 5310-00-123-4567')
    expect(a.notice_id).toMatch(/^RFQ-[0-9A-F]{10}$/)
    expect(a.notice_id).toBe(b.notice_id)
  })
})

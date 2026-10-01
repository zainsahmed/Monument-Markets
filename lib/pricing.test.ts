import { describe, expect, it } from 'vitest'
import { computePricing, lineCost, quoteExpiryWarnings, type PricingLine } from './pricing'

const full = (o: Partial<PricingLine> = {}): PricingLine => ({
  clin: '0001', unit_cost: 10, quantity: 100, shipping: 50, labor: 0, subcontractors: 0, travel: 0, insurance: 25, other: 0, quote_id: 'q1', ...o,
})

describe('pricing formulas', () => {
  it('line cost = unit × qty + all other costs', () => {
    expect(lineCost(full())).toBe(1075)
    expect(lineCost(full({ labor: 100, travel: 25, subcontractors: 40, other: 10 }))).toBe(1250)
  })
  it('price at desired margin = cost ÷ (1 − m)', () => {
    const r = computePricing({ lines: [full()], desiredMargin: 0.2, targetPrice: null })
    expect(r.totalCost).toBe(1075)
    expect(r.priceAtDesiredMargin).toBe(1343.75)
    expect(r.revenue).toBe(1343.75)
    expect(r.grossProfit).toBe(268.75)
    expect(r.grossMargin).toBeCloseTo(0.2, 10)
    expect(r.estimated).toBe(false)
  })
  it('solves margin from a target price', () => {
    const r = computePricing({ lines: [full()], desiredMargin: null, targetPrice: 1500 })
    expect(r.revenueSource).toBe('target')
    expect(r.grossProfit).toBe(425)
    expect(r.grossMargin).toBeCloseTo(425 / 1500, 10)
  })
  it('sums multiple lines', () => {
    const r = computePricing({ lines: [full(), full({ clin: '0002', unit_cost: 20, quantity: 10 })], desiredMargin: 0.1, targetPrice: null })
    expect(r.totalCost).toBe(1075 + 200 + 50 + 25)
  })
  it('target price wins for revenue but desired-margin price is still reported', () => {
    const r = computePricing({ lines: [full()], desiredMargin: 0.2, targetPrice: 1100 })
    expect(r.revenueSource).toBe('target')
    expect(r.priceAtDesiredMargin).toBe(1343.75)
  })
})

describe('ESTIMATED logic', () => {
  it('shows nothing about profitability when no costs are entered', () => {
    const blank: PricingLine = { unit_cost: null, quantity: null, shipping: null, labor: null, subcontractors: null, travel: null, insurance: null, other: null }
    const r = computePricing({ lines: [blank], desiredMargin: 0.2, targetPrice: 5000 })
    expect(r.state).toBe('none')
    expect(r.totalCost).toBeNull()
    expect(r.grossMargin).toBeNull()
    expect(r.revenue).toBeNull()
    expect(r.estimated).toBe(true)
    expect(computePricing({ lines: [], desiredMargin: 0.2, targetPrice: null }).state).toBe('none')
  })
  it('a quantity alone is not a cost', () => {
    const r = computePricing({ lines: [{ unit_cost: null, quantity: 5, shipping: null, labor: null, subcontractors: null, travel: null, insurance: null, other: null }], desiredMargin: 0.2, targetPrice: null })
    expect(r.state).toBe('none')
  })
  it('blank inputs mark ESTIMATED and are listed, not treated as known zeros', () => {
    const r = computePricing({ lines: [full({ labor: null, travel: null })], desiredMargin: 0.2, targetPrice: null })
    expect(r.state).toBe('computed')
    expect(r.estimated).toBe(true)
    expect(r.missing.filter((m) => m.reason === 'blank').map((m) => m.field)).toEqual(['labor', 'travel'])
  })
  it('product cost without a supplier quote is ESTIMATED and listed as unquoted', () => {
    const r = computePricing({ lines: [full({ quote_id: null })], desiredMargin: 0.2, targetPrice: null })
    expect(r.estimated).toBe(true)
    expect(r.missing).toEqual([expect.objectContaining({ field: 'quote', reason: 'unquoted' })])
  })
  it('explicit zeros + quote = not estimated', () => {
    expect(computePricing({ lines: [full()], desiredMargin: 0.2, targetPrice: null }).estimated).toBe(false)
  })
})

describe('guards', () => {
  it('warns when margin is below the profile minimum', () => {
    const r = computePricing({ lines: [full()], desiredMargin: null, targetPrice: 1100, minMargin: 0.15 })
    expect(r.belowMinMargin).toBe(true)
    expect(r.marginWarning).toMatch(/below your minimum of 15\.0%/)
  })
  it('rejects impossible margins', () => {
    const r = computePricing({ lines: [full()], desiredMargin: 1, targetPrice: null })
    expect(r.errors[0]).toMatch(/below 100%/)
    expect(r.priceAtDesiredMargin).toBeNull()
  })
  it('flags quotes expiring before the offer deadline', () => {
    const w = quoteExpiryWarnings([{ id: 'a', valid_until: '2026-10-05' }, { id: 'b', valid_until: '2026-11-30' }, { id: 'c', valid_until: null }], '2026-10-20T18:00:00Z')
    expect(w.map((q) => q.id)).toEqual(['a'])
    expect(quoteExpiryWarnings([{ id: 'a', valid_until: '2026-10-05' }], null)).toEqual([])
  })
})

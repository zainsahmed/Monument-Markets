/**
 * Pricing calculator (spec §12). Pure functions.
 *   line cost    = unit cost × quantity + shipping + labor + subcontractors + travel + insurance + other
 *   total cost   = Σ line costs
 *   price @ m    = total cost ÷ (1 − m)
 *   gross profit = revenue − total cost;   gross margin = gross profit ÷ revenue
 * Blank (null) inputs are NEVER treated as known zeros: they make the result ESTIMATED and are listed.
 */
export const COST_FIELDS = ['unit_cost', 'quantity', 'shipping', 'labor', 'subcontractors', 'travel', 'insurance', 'other'] as const
export type CostField = (typeof COST_FIELDS)[number]

export const FIELD_LABELS: Record<CostField, string> = {
  unit_cost: 'Unit product cost', quantity: 'Quantity', shipping: 'Shipping', labor: 'Labor',
  subcontractors: 'Subcontractors', travel: 'Travel', insurance: 'Insurance / bonding', other: 'Other costs',
}

export interface PricingLine {
  clin?: string | null
  description?: string | null
  unit_cost: number | null
  quantity: number | null
  shipping: number | null
  labor: number | null
  subcontractors: number | null
  travel: number | null
  insurance: number | null
  other: number | null
  /** supplier quote backing the product cost (null = unquoted) */
  quote_id?: string | null
}

export interface MissingInput {
  line: number
  clin: string | null
  field: CostField | 'quote'
  reason: 'blank' | 'unquoted'
  message: string
}

export interface PricingInput {
  lines: PricingLine[]
  desiredMargin: number | null // 0..1
  targetPrice: number | null
  minMargin?: number | null
}

export interface PricingResult {
  /** 'none' = no cost has been entered; nothing about profitability may be shown. */
  state: 'none' | 'computed'
  estimated: boolean
  missing: MissingInput[]
  lineCosts: number[]
  totalCost: number | null
  priceAtDesiredMargin: number | null
  revenue: number | null
  revenueSource: 'target' | 'desired_margin' | null
  grossProfit: number | null
  grossMargin: number | null
  belowMinMargin: boolean
  marginWarning: string | null
  errors: string[]
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function lineCost(l: PricingLine): number {
  return round2((num(l.unit_cost) ?? 0) * (num(l.quantity) ?? 0) + (num(l.shipping) ?? 0) + (num(l.labor) ?? 0) + (num(l.subcontractors) ?? 0) + (num(l.travel) ?? 0) + (num(l.insurance) ?? 0) + (num(l.other) ?? 0))
}

export function computePricing(input: PricingInput): PricingResult {
  const missing: MissingInput[] = []
  const errors: string[] = []
  input.lines.forEach((l, i) => {
    const clin = l.clin ?? null
    for (const f of COST_FIELDS) {
      if (num(l[f]) === null) missing.push({ line: i, clin, field: f, reason: 'blank', message: `${FIELD_LABELS[f]} is blank${clin ? ` (CLIN ${clin})` : ` (line ${i + 1})`}` })
    }
    if (num(l.unit_cost) !== null && !l.quote_id) {
      missing.push({ line: i, clin, field: 'quote', reason: 'unquoted', message: `Product cost isn't backed by a supplier quote${clin ? ` (CLIN ${clin})` : ` (line ${i + 1})`}` })
    }
  })

  const entered = input.lines.some((l) => COST_FIELDS.some((f) => f !== 'quantity' && num(l[f]) !== null))
  const lineCosts = input.lines.map(lineCost)
  const base: PricingResult = {
    state: 'none', estimated: true, missing, lineCosts, totalCost: null, priceAtDesiredMargin: null,
    revenue: null, revenueSource: null, grossProfit: null, grossMargin: null, belowMinMargin: false, marginWarning: null, errors,
  }
  if (input.lines.length === 0 || !entered) return base // never show profitability with no costs entered

  const totalCost = round2(lineCosts.reduce((a, b) => a + b, 0))
  const m = num(input.desiredMargin)
  const target = num(input.targetPrice)
  let priceAtMargin: number | null = null
  if (m !== null) {
    if (m < 0 || m >= 1) errors.push('Desired margin must be at least 0% and below 100%.')
    else priceAtMargin = round2(totalCost / (1 - m))
  }
  if (target !== null && target <= 0) errors.push('Target price must be greater than zero.')

  let revenue: number | null = null
  let source: PricingResult['revenueSource'] = null
  if (target !== null && target > 0) { revenue = round2(target); source = 'target' }
  else if (priceAtMargin !== null) { revenue = priceAtMargin; source = 'desired_margin' }

  const grossProfit = revenue === null ? null : round2(revenue - totalCost)
  const grossMargin = revenue === null || revenue === 0 || grossProfit === null ? null : grossProfit / revenue
  const min = num(input.minMargin)
  const belowMin = grossMargin !== null && min !== null && grossMargin < min
  return {
    ...base, state: 'computed', estimated: missing.length > 0, totalCost, priceAtDesiredMargin: priceAtMargin,
    revenue, revenueSource: source, grossProfit, grossMargin, belowMinMargin: belowMin,
    marginWarning: belowMin ? `Gross margin ${(grossMargin! * 100).toFixed(1)}% is below your minimum of ${(min! * 100).toFixed(1)}%.` : null,
  }
}

export interface QuoteLite { id: string; valid_until: string | null; supplier?: string }
/** Quotes whose validity ends before the offer deadline (spec §11). */
export function quoteExpiryWarnings(quotes: QuoteLite[], offerDeadline: Date | string | null): QuoteLite[] {
  if (!offerDeadline) return []
  const dl = new Date(offerDeadline).getTime()
  return quotes.filter((q) => q.valid_until && new Date(`${q.valid_until}T23:59:59Z`).getTime() < dl)
}

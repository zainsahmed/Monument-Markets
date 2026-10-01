/** "Can we bid this?" checklist (spec §9). PASS / FAIL / UNKNOWN / N/A — no numeric score. */
export type ChecklistStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NA'
export interface TemplateItem { group: string; key: string; label: string }

export const GROUPS = ['Eligibility', 'Defense compliance', 'Performance', 'Commercial'] as const

export const DEFAULT_TEMPLATE: TemplateItem[] = [
  ['Eligibility', 'sam_registration', 'SAM registration active'],
  ['Eligibility', 'naics_compatible', 'NAICS compatible'],
  ['Eligibility', 'size_standard', 'Size standard satisfied'],
  ['Eligibility', 'set_aside_eligibility', 'Set-aside eligibility'],
  ['Eligibility', 'required_certifications', 'Required certifications'],
  ['Eligibility', 'required_licenses', 'Required licenses'],
  ['Eligibility', 'security_requirements', 'Security requirements'],
  ['Eligibility', 'manufacturer_authorization', 'Manufacturer authorization / approved source'],
  ['Eligibility', 'past_performance', 'Past performance'],
  ['Eligibility', 'geographic_requirements', 'Geographic requirements'],
  ['Defense compliance', 'cmmc_level', 'CMMC level met'],
  ['Defense compliance', 'sprs_score', 'SPRS score posted and current'],
  ['Defense compliance', 'itar_ear', 'ITAR / EAR compliance'],
  ['Defense compliance', 'berry_specialty_metals', 'Berry Amendment / specialty metals'],
  ['Defense compliance', 'buy_american_taa', 'Buy American / TAA country of origin'],
  ['Defense compliance', 'iuid_marking', 'IUID marking capability'],
  ['Defense compliance', 'packaging_marking', 'Packaging & marking (MIL-STD-129 / 2073)'],
  ['Defense compliance', 'first_article', 'First article testing'],
  ['Defense compliance', 'wawf', 'WAWF registration'],
  ['Performance', 'can_source', 'Can source product / service'],
  ['Performance', 'can_meet_quantity', 'Can meet quantity'],
  ['Performance', 'can_meet_delivery', 'Can meet delivery date'],
  ['Performance', 'can_provide_labor', 'Can provide labor'],
  ['Performance', 'installation', 'Installation'],
  ['Performance', 'maintenance', 'Maintenance'],
  ['Performance', 'warranty', 'Warranty'],
  ['Commercial', 'supplier_identified', 'Supplier identified'],
  ['Commercial', 'supplier_quote', 'Supplier quote obtained'],
  ['Commercial', 'shipping_known', 'Shipping cost known'],
  ['Commercial', 'labor_known', 'Labor cost known'],
  ['Commercial', 'insurance_known', 'Insurance / bonding known'],
  ['Commercial', 'margin_calculated', 'Margin calculated'],
].map(([group, key, label]) => ({ group, key, label }))

export interface ChecklistSummary {
  pass: number; fail: number; unknown: number; na: number; total: number
  /** plain-language statement, e.g. "3 items unknown, 1 failed — not ready." */
  statement: string
  ready: boolean
}

/** Counts + plain statement. Deliberately no score, no percentage. */
export function summarizeChecklist(items: Array<{ status: ChecklistStatus }>): ChecklistSummary {
  const c = { PASS: 0, FAIL: 0, UNKNOWN: 0, NA: 0 }
  items.forEach((i) => { c[i.status]++ })
  const parts: string[] = []
  if (c.UNKNOWN) parts.push(`${c.UNKNOWN} item${c.UNKNOWN > 1 ? 's' : ''} unknown`)
  if (c.FAIL) parts.push(`${c.FAIL} failed`)
  const ready = items.length > 0 && c.UNKNOWN === 0 && c.FAIL === 0
  const statement = items.length === 0 ? 'No checklist items yet.' : ready ? 'All applicable items pass — ready for your review.' : `${parts.join(', ')} — not ready.`
  return { pass: c.PASS, fail: c.FAIL, unknown: c.UNKNOWN, na: c.NA, total: items.length, statement, ready }
}

/** A user may change status freely. This guards the AI path: an AI suggestion is never applied as a status. */
export function applyAiSuggestion(current: ChecklistStatus, _suggested: ChecklistStatus): ChecklistStatus {
  return current // suggestions are shown as ghost values; only a user action changes status
}

/** Auto-computed facts that can pre-fill an UNKNOWN item as a suggestion (never as PASS). */
export function profileSuggestions(p: { sam_status: string | null; sam_expiration: string | null; sprs_date: string | null; sprs_score: number | null; cmmc_level: string | null }, deadline: Date | null, now = new Date()): Record<string, { status: ChecklistStatus; why: string }> {
  const out: Record<string, { status: ChecklistStatus; why: string }> = {}
  const ref = deadline ?? now
  if (p.sam_expiration) {
    const exp = new Date(`${p.sam_expiration}T23:59:59Z`)
    out.sam_registration = exp > ref && p.sam_status === 'active'
      ? { status: 'PASS', why: `Profile shows SAM active, expiring ${p.sam_expiration}${deadline ? ' (after the offer deadline)' : ''}.` }
      : { status: 'FAIL', why: `Profile SAM status/expiration (${p.sam_status ?? 'unknown'}, ${p.sam_expiration}) does not cover the offer deadline.` }
  }
  if (p.sprs_date) {
    const age = (now.getTime() - new Date(p.sprs_date).getTime()) / 864e5
    out.sprs_score = age <= 365 * 3 ? { status: 'PASS', why: `SPRS score ${p.sprs_score ?? '?'} posted ${p.sprs_date}.` } : { status: 'FAIL', why: `SPRS assessment dated ${p.sprs_date} is over three years old.` }
  }
  return out
}

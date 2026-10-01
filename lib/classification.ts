/**
 * Deterministic colour classification (spec §6). No AI involved.
 * GREEN means "bid-type notice", NOT "we are eligible". Mirrors SQL compute_color_label()
 * (parity is asserted in tests/db/rls.test.ts and lib/classification.test.ts).
 */
export type ColorLabel = 'GREEN' | 'YELLOW' | 'RED'

export interface ClassificationInput {
  noticeTypeCode: string | null
  active: boolean
  cancelled?: boolean
  responseDeadline: Date | string | null
  now?: Date
}
export interface Classification {
  label: ColorLabel
  /** Human-readable rule that produced the label (shown in a popover). */
  rule: string
}

export const BID_TYPE_CODES = ['o', 'k', 'dibbs_rfq'] as const

export function classify(i: ClassificationInput): Classification {
  const now = i.now ?? new Date()
  const deadline = i.responseDeadline ? new Date(i.responseDeadline) : null
  const code = i.noticeTypeCode

  if (code === 'a') return { label: 'RED', rule: 'Award Notice — an award has been made; this is not a bid opportunity.' }
  if (code === 'u') return { label: 'RED', rule: 'Justification (J&A) — the government documented a non-competitive award; not bid-ready.' }
  if (i.cancelled) return { label: 'RED', rule: 'The notice is cancelled.' }
  if (!i.active) return { label: 'RED', rule: 'The notice is inactive or archived.' }
  if (deadline && deadline.getTime() <= now.getTime()) return { label: 'RED', rule: 'The response deadline has passed.' }
  if (code && (BID_TYPE_CODES as readonly string[]).includes(code)) {
    if (deadline) return { label: 'GREEN', rule: 'Bid-type notice (Solicitation, Combined Synopsis/Solicitation or DIBBS RFQ), active, with a future response deadline. This is not a statement that your company is eligible.' }
    return { label: 'YELLOW', rule: 'Bid-type notice, but no response deadline is listed — treat as research/watch until a deadline appears.' }
  }
  switch (code) {
    case 'r': return { label: 'YELLOW', rule: 'Sources Sought — market research; no offers are being accepted.' }
    case 'p': return { label: 'YELLOW', rule: 'Presolicitation — a solicitation is expected later.' }
    case 's': return { label: 'YELLOW', rule: 'Special Notice — informational.' }
    case 'i': return { label: 'YELLOW', rule: 'Intent to Bundle — informational.' }
    default: return { label: 'YELLOW', rule: 'Not a bid-type notice (or type unknown) — research/watch.' }
  }
}

export const LABEL_TEXT: Record<ColorLabel, string> = {
  GREEN: 'Potential bid',
  YELLOW: 'Research / watch',
  RED: 'Awarded / not bid-ready',
}

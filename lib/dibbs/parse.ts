import { createHash } from 'node:crypto'
import { parseDeadline } from '@/lib/sam/time'

/**
 * DIBBS RFQ text parser (spec §5.3). DIBBS has no public API and we never scrape or automate logins:
 * the user uploads an RFQ PDF/export or pastes its text, and we parse labelled fields. Anything we can't
 * find is reported as missing (shown as "Unknown") — never guessed.
 */
export interface DibbsRfq {
  rfq_number: string | null
  nsn: string | null
  fsc: string | null
  part_number: string | null
  nomenclature: string | null
  quantity: number | null
  unit_of_issue: string | null
  delivery_days: number | null
  required_delivery_date: string | null
  approved_sources: Array<{ cage: string; part_number: string | null }>
  packaging: string | null
  fob: string | null
  set_aside: string | null
  issue_date: string | null
  close_date: string | null
  missing: string[]
}

const NSN_RE = /\b(\d{4})-?(\d{2})-?(\d{3})-?(\d{4})\b/
const MONTHS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }

export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = t.match(/\b(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})\b/)
  if (m && MONTHS[m[2].toUpperCase()]) return `${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`
  m = t.match(/\b([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (m && MONTHS[m[1].toUpperCase()]) return `${m[3]}-${MONTHS[m[1].toUpperCase()]}-${m[2].padStart(2, '0')}`
  return null
}

/** First value following any of the labels on the same line ("LABEL: value" / "LABEL - value"). */
function field(text: string, labels: string[]): string | null {
  for (const l of labels) {
    const re = new RegExp(`(?:^|\\n)[ \\t]*${l}[ \\t]*[:#\\-–][ \\t]*([^\\n]+)`, 'i')
    const m = text.match(re)
    if (m && m[1].trim()) return m[1].trim()
  }
  return null
}

export function parseDibbsRfq(raw: string): DibbsRfq {
  const text = raw.replace(/\r\n/g, '\n')
  const rfq = field(text, ['RFQ\\s*(?:NO|NUMBER|#)?', 'SOLICITATION\\s*(?:NO|NUMBER)?'])?.match(/[A-Z0-9]{5,6}-\d{2}-[A-Z]-[A-Z0-9]{3,6}/i)?.[0]?.toUpperCase()
    ?? text.match(/\b(SP[A-Z0-9]{4}-\d{2}-[QTR]-[A-Z0-9]{4})\b/i)?.[1]?.toUpperCase() ?? null

  const nsnRaw = field(text, ['NSN(?:\\s*/\\s*PART)?', 'NATIONAL\\s+STOCK\\s+NUMBER'])
  const nsnM = (nsnRaw ?? text).match(NSN_RE)
  const nsn = nsnM ? `${nsnM[1]}-${nsnM[2]}-${nsnM[3]}-${nsnM[4]}` : null

  const part = field(text, ['PART\\s*(?:NUMBER|NO|#)', 'P\\/N'])?.split(/\s{2,}|\s+CAGE\b/i)[0]?.trim() ?? null
  const nomen = field(text, ['NOMENCLATURE', 'ITEM\\s+DESCRIPTION', 'DESCRIPTION'])
  const qtyLine = field(text, ['QTY', 'QUANTITY'])
  const qm = qtyLine?.match(/([\d,]+(?:\.\d+)?)(?:\s+(?!UI\b)([A-Z]{2})\b)?/)
  const quantity = qm ? Number(qm[1].replace(/,/g, '')) : null
  const ui = text.match(/\b(?:UI|UNIT\s+OF\s+ISSUE)[ \t]*[:#\-][ \t]*([A-Z]{2})\b/)?.[1] ?? qm?.[2] ?? null

  const deliveryLine = field(text, ['DELIVERY', 'DELIVERY\\s+DAYS', 'DELIV(?:ERY)?\\s+REQUIRED'])
  const dd = deliveryLine?.match(/(\d{1,3})\s*(?:DAYS?|DAY|ARO)/i)
  const reqDate = parseDate(field(text, ['REQUIRED\\s+DELIVERY(?:\\s+DATE)?', 'DELIVER\\s+BY', 'DELIVERY\\s+DATE']))

  const sources: DibbsRfq['approved_sources'] = []
  for (const m of text.matchAll(/CAGE[ \t]*[:#]?[ \t]*([A-Z0-9]{5})\b(?:[^\n]*?(?:P\/N|PART(?:\s*NO|\s*NUMBER)?)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9\-\/.]+))?/gi)) {
    const cage = m[1].toUpperCase()
    const prev = sources.find((s) => s.cage === cage)
    if (!prev) sources.push({ cage, part_number: m[2] ?? null })
    else if (!prev.part_number && m[2]) prev.part_number = m[2]
  }

  const packaging = field(text, ['PACKAGING', 'PKG', 'PACKAGING\\s+REQUIREMENTS'])
  const fob = field(text, ['FOB'])?.match(/destination|origin/i)?.[0] ?? field(text, ['FOB'])
  const setAside = field(text, ['SET[\\s-]?ASIDE', 'SMALL\\s+BUSINESS'])
  const issue = parseDate(field(text, ['ISSUE\\s+DATE', 'ISSUED', 'DATE\\s+ISSUED']))
  const close = parseDate(field(text, ['RETURN\\s+BY', 'CLOSING\\s+DATE', 'CLOSE\\s+DATE', 'QUOTE\\s+DUE', 'OFFERS?\\s+DUE', 'RESPONSE\\s+DUE']))

  const out: DibbsRfq = {
    rfq_number: rfq, nsn, fsc: nsn ? nsn.slice(0, 4) : null, part_number: part || null, nomenclature: nomen,
    quantity: quantity !== null && Number.isFinite(quantity) ? quantity : null, unit_of_issue: ui,
    delivery_days: dd ? Number(dd[1]) : null, required_delivery_date: reqDate, approved_sources: sources,
    packaging, fob: fob ? fob.trim() : null, set_aside: setAside, issue_date: issue, close_date: close, missing: [],
  }
  const labels: Array<[keyof DibbsRfq, string]> = [
    ['rfq_number', 'RFQ number'], ['nsn', 'NSN'], ['part_number', 'Part number'], ['nomenclature', 'Nomenclature'], ['quantity', 'Quantity'],
    ['unit_of_issue', 'Unit of issue'], ['delivery_days', 'Delivery days'], ['required_delivery_date', 'Required delivery date'],
    ['packaging', 'Packaging'], ['fob', 'FOB'], ['set_aside', 'Set-aside'], ['close_date', 'Close date'],
  ]
  out.missing = labels.filter(([k]) => out[k] === null).map(([, l]) => l)
  if (out.approved_sources.length === 0) out.missing.push('Approved sources / CAGE')
  return out
}

export function dibbsToOpportunity(r: DibbsRfq, rawText: string) {
  const id = r.rfq_number ?? `RFQ-${createHash('sha256').update(rawText).digest('hex').slice(0, 10).toUpperCase()}`
  const dl = parseDeadline(r.close_date)
  const title = [r.nomenclature ?? 'DIBBS RFQ', r.nsn ? `NSN ${r.nsn}` : null].filter(Boolean).join(' — ')
  return {
    source: 'DIBBS' as const,
    notice_id: id,
    solicitation_number: r.rfq_number,
    title,
    department: 'Defense Logistics Agency',
    sub_tier: 'DLA Land and Maritime / DIBBS',
    notice_type: 'DIBBS RFQ',
    notice_type_code: 'dibbs_rfq',
    posted_date: r.issue_date,
    response_deadline: dl.iso,
    response_deadline_raw: r.close_date,
    psc: r.fsc, // the first four NSN digits are the Federal Supply Class
    naics: null,
    set_aside: r.set_aside,
    description: rawText,
    active: true,
    cancelled: false,
    dibbs: {
      nsn: r.nsn, part_number: r.part_number, quantity: r.quantity, unit_of_issue: r.unit_of_issue, delivery_days: r.delivery_days,
      required_delivery_date: r.required_delivery_date, approved_sources: r.approved_sources, packaging: r.packaging, fob: r.fob, missing: r.missing,
    },
  }
}

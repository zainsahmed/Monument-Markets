import { describe, expect, it } from 'vitest'
import { buildIndex, checkStatement, emptyStats, normaliseText, verifyCitation, type Statement } from './citations'

const index = buildIndex([
  {
    documentId: 'pdf1', name: 'RFQ.pdf',
    pages: [
      { page: 1, section: 'Section B', pageReliable: true, text: 'SUPPLIES OR SERVICES AND PRICES\nCLIN 0001 — Hydraulic pump, P/N 1234-56, quantity 40 EA.' },
      { page: 2, section: 'Section F', pageReliable: true, text: 'Delivery shall be made within 90 days after receipt of order (ARO), FOB Destination.\nFirst article testing is required prior to production.' },
    ],
  },
  {
    documentId: 'docx1', name: 'SOW.docx',
    pages: [
      { page: 1, section: 'C.3 Delivery', pageReliable: false, text: 'The contractor shall deliver all items to Redstone Arsenal, AL 35898.' },
      { page: 2, section: 'C.4 Insurance', pageReliable: false, text: 'General liability insurance of $1,000,000 per occurrence is required.' },
    ],
  },
  { documentId: 'xlsx1', name: 'CLIN.xlsx', pages: [{ page: 1, section: 'Pricing', locator: 'Pricing!A1:F20', pageReliable: false, text: 'CLIN 0002 Installation services lot 1 unit price blank' }] },
])

const cite = (documentId: string, page: number, snippet: string, section = '') => ({ documentId, page, section, snippet })

describe('normaliseText', () => {
  it('collapses whitespace, case, quotes, dashes and line-break hyphenation', () => {
    expect(normaliseText('  Hydraulic\n  PUMP — “P/N”  ')).toBe('hydraulic pump - "p/n"')
    expect(normaliseText('manufac-\nturer')).toBe('manufacturer')
  })
})

describe('verifyCitation', () => {
  it('accepts an exact snippet on the cited page, ignoring case/whitespace', () => {
    expect(verifyCitation(cite('pdf1', 2, 'delivery shall be made within 90 days   after receipt of order'), index).ok).toBe(true)
  })
  it('rejects a snippet that is on a different page', () => {
    const r = verifyCitation(cite('pdf1', 1, 'first article testing is required'), index)
    expect(r).toMatchObject({ ok: false, reason: 'snippet_not_found' })
  })
  it('rejects invented snippets, unknown documents, missing pages and tiny snippets', () => {
    expect(verifyCitation(cite('pdf1', 2, 'payment within 30 days of invoice'), index).reason).toBe('snippet_not_found')
    expect(verifyCitation(cite('nope', 1, 'delivery shall be made'), index).reason).toBe('unknown_document')
    expect(verifyCitation(cite('pdf1', 9, 'delivery shall be made within 90 days'), index).reason).toBe('page_not_found')
    expect(verifyCitation(cite('pdf1', 2, 'FOB'), index).reason).toBe('snippet_too_short')
  })
  it('matches DOCX by section heading (page unavailable)', () => {
    expect(verifyCitation(cite('docx1', 0, 'deliver all items to Redstone Arsenal', 'C.3 Delivery'), index).ok).toBe(true)
    expect(verifyCitation(cite('docx1', 0, 'deliver all items to Redstone Arsenal', 'C.4 Insurance'), index).ok).toBe(false)
  })
  it('matches XLSX by sheet / cell range', () => {
    expect(verifyCitation(cite('xlsx1', 0, 'CLIN 0002 Installation services', 'Pricing'), index).ok).toBe(true)
    expect(verifyCitation(cite('xlsx1', 0, 'CLIN 0002 Installation services', 'Pricing!A1:F20'), index).ok).toBe(true)
  })
})

describe('checkStatement', () => {
  const good = cite('pdf1', 2, 'First article testing is required prior to production')
  const bad = cite('pdf1', 2, 'Offerors must hold a TS facility clearance')
  it('keeps VERIFIED when at least one citation passes, drops the failed ones', () => {
    const stats = emptyStats()
    const out = checkStatement({ text: 'FAT required', label: 'VERIFIED', citations: [good, bad] }, index, stats)
    expect(out.label).toBe('VERIFIED')
    expect(out.citations).toHaveLength(1)
    expect(stats).toMatchObject({ total: 2, rejected: 1, downgraded: 0 })
  })
  it('downgrades VERIFIED to NEEDS_VERIFICATION with no passing citation', () => {
    const stats = emptyStats()
    const out = checkStatement({ text: 'TS clearance needed', label: 'VERIFIED', citations: [bad] }, index, stats)
    expect(out.label).toBe('NEEDS_VERIFICATION')
    expect(out.citations).toEqual([])
    expect(stats.downgraded).toBe(1)
    expect(stats.byReason.snippet_not_found).toBe(1)
  })
  it('downgrades VERIFIED with no citations at all', () => {
    expect(checkStatement({ text: 'x', label: 'VERIFIED', citations: [] }, index).label).toBe('NEEDS_VERIFICATION')
  })
  it('leaves ANALYSIS and NEEDS_VERIFICATION labels alone', () => {
    const s: Statement = { text: 'Looks hard', label: 'ANALYSIS', citations: [] }
    expect(checkStatement(s, index).label).toBe('ANALYSIS')
    expect(checkStatement({ ...s, label: 'NEEDS_VERIFICATION' }, index).label).toBe('NEEDS_VERIFICATION')
  })
})

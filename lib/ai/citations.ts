/**
 * Mandatory citation check (spec §8.3). After every AI extraction each citation is verified
 * programmatically: normalise whitespace/case and confirm the snippet exists on the cited page
 * (or section / sheet). Failed citations are removed; a VERIFIED statement left without a valid
 * citation is downgraded to NEEDS_VERIFICATION. Nothing the model claims about its own citations
 * is trusted.
 */
export type Label = 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION'

export interface Citation {
  documentId: string
  page: number // 0 = not applicable
  section: string // '' = none
  snippet: string
}
export interface Statement {
  text: string
  label: Label
  citations: Citation[]
}

export interface IndexedPage {
  page: number
  section: string | null
  text: string
  /** false for DOCX / TXT where page numbers don't exist; those are matched by section */
  pageReliable: boolean
  locator?: string | null
}
export interface DocumentIndex {
  documentId: string
  name: string
  pages: IndexedPage[]
}
export type CitationIndex = Map<string, DocumentIndex>

export function buildIndex(docs: DocumentIndex[]): CitationIndex {
  return new Map(docs.map((d) => [d.documentId, d]))
}

/** Lowercase, unify quotes/dashes/whitespace, undo end-of-line hyphenation. */
export function normaliseText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export const MIN_SNIPPET_CHARS = 12

export type RejectReason = 'unknown_document' | 'page_not_found' | 'snippet_too_short' | 'snippet_not_found'
export interface CitationCheck {
  ok: boolean
  reason?: RejectReason
  /** page that actually contains the snippet */
  matchedPage?: IndexedPage
}

export function verifyCitation(c: Citation, index: CitationIndex): CitationCheck {
  const doc = index.get(c.documentId)
  if (!doc) return { ok: false, reason: 'unknown_document' }
  const snippet = normaliseText(c.snippet ?? '')
  if (snippet.length < MIN_SNIPPET_CHARS) return { ok: false, reason: 'snippet_too_short' }

  let candidates: IndexedPage[]
  const reliablePages = doc.pages.filter((p) => p.pageReliable)
  if (reliablePages.length > 0 && c.page > 0) {
    candidates = doc.pages.filter((p) => p.page === c.page)
  } else if (c.section) {
    const sec = normaliseText(c.section)
    candidates = doc.pages.filter((p) => p.section && (normaliseText(p.section) === sec || normaliseText(p.section).includes(sec) || (p.locator ? normaliseText(p.locator).includes(sec) : false)))
    // DOCX/TXT have no real pages: accept a document-wide match if the section label was wrong.
    if (candidates.length === 0 && reliablePages.length === 0) candidates = doc.pages
  } else if (reliablePages.length === 0) {
    candidates = doc.pages
  } else {
    return { ok: false, reason: 'page_not_found' }
  }
  if (candidates.length === 0) return { ok: false, reason: 'page_not_found' }
  for (const p of candidates) {
    if (normaliseText(p.text).includes(snippet)) return { ok: true, matchedPage: p }
  }
  return { ok: false, reason: 'snippet_not_found' }
}

export interface CheckStats {
  total: number
  rejected: number
  byReason: Partial<Record<RejectReason, number>>
  downgraded: number
}
export const emptyStats = (): CheckStats => ({ total: 0, rejected: 0, byReason: {}, downgraded: 0 })

/** Verify one statement: strip failed citations, downgrade unsupported VERIFIED claims. */
export function checkStatement(s: Statement, index: CitationIndex, stats: CheckStats = emptyStats()): Statement {
  const valid: Citation[] = []
  for (const c of s.citations ?? []) {
    stats.total++
    const r = verifyCitation(c, index)
    if (r.ok) {
      // Normalise the citation to where the text really is.
      valid.push({ documentId: c.documentId, page: r.matchedPage?.page ?? c.page, section: r.matchedPage?.section ?? c.section, snippet: c.snippet.trim() })
    } else {
      stats.rejected++
      stats.byReason[r.reason!] = (stats.byReason[r.reason!] ?? 0) + 1
    }
  }
  let label: Label = s.label
  if (label === 'VERIFIED' && valid.length === 0) {
    label = 'NEEDS_VERIFICATION'
    stats.downgraded++
  }
  return { text: s.text, label, citations: valid }
}

export const LABEL_DISPLAY: Record<Label, string> = {
  VERIFIED: 'Verified from solicitation',
  ANALYSIS: 'AI analysis',
  NEEDS_VERIFICATION: 'Needs verification',
}

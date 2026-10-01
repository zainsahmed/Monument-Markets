/** Solicitation section-heading detection ("Section L", "C.3 Delivery", "L.2 Instructions"). */
const PATTERNS: RegExp[] = [
  /^\s*(SECTION\s+[A-M](?:\b|\s*[-–—:.])\s*.{0,80})$/i,
  /^\s*([A-M]\.\d+(?:\.\d+){0,3}\.?\s+[A-Z][^\n]{2,80})$/,
  /^\s*(PART\s+[IVX]+\b.{0,80})$/i,
]
export function detectHeading(line: string): string | null {
  const t = line.trim()
  if (t.length < 3 || t.length > 100) return null
  for (const p of PATTERNS) {
    const m = t.match(p)
    if (m) return m[1].trim().replace(/\s+/g, ' ')
  }
  return null
}
/** All headings on a page, in order. */
export function headingsIn(text: string): string[] {
  return text.split(/\n/).map(detectHeading).filter((h): h is string => !!h)
}
/** Assign each page the last heading found on it, else the heading carried over from earlier pages. */
export function assignSections(pageTexts: string[]): Array<string | null> {
  let current: string | null = null
  return pageTexts.map((t) => {
    const hs = headingsIn(t)
    if (hs.length) current = hs[hs.length - 1]
    return current
  })
}

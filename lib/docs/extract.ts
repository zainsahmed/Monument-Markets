import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { assignSections, detectHeading } from './sections'

export type ParseStatus = 'parsed' | 'ocr_needed' | 'failed'
export interface ExtractedPage {
  page: number
  section: string | null
  locator: string | null
  text: string
  pageReliable: boolean
}
export interface ExtractedDocument {
  kind: 'pdf' | 'docx' | 'xlsx' | 'txt'
  pageCount: number
  pages: ExtractedPage[]
  status: ParseStatus
  /** human-readable note, e.g. which pages need OCR */
  note: string | null
}

export const SUPPORTED_MIME: Record<string, ExtractedDocument['kind']> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
}
export function kindFromName(name: string, mime?: string | null): ExtractedDocument['kind'] | null {
  if (mime && SUPPORTED_MIME[mime]) return SUPPORTED_MIME[mime]
  const ext = name.toLowerCase().split('.').pop()
  return ({ pdf: 'pdf', docx: 'docx', xlsx: 'xlsx', txt: 'txt' } as const)[ext as 'pdf'] ?? null
}

/** Below this many characters a PDF page is treated as scanned / image-only. */
export const OCR_PAGE_CHARS = 25

export async function extractPdf(data: Uint8Array): Promise<ExtractedDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, disableFontFace: true, verbosity: 0 })
  const doc = await task.promise
  const texts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let out = ''
    let lastY: number | null = null
    for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string') continue
      const y = item.transform ? item.transform[5] : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n'
      out += item.str
      if (item.hasEOL) out += '\n'
      else if (item.str && !out.endsWith(' ') && !out.endsWith('\n')) out += ' '
      lastY = y
    }
    texts.push(out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
    page.cleanup()
  }
  await task.destroy()
  const sections = assignSections(texts)
  const pages: ExtractedPage[] = texts.map((text, i) => ({ page: i + 1, section: sections[i], locator: null, text, pageReliable: true }))
  const empty = pages.filter((p) => p.text.replace(/\s/g, '').length < OCR_PAGE_CHARS).map((p) => p.page)
  let status: ParseStatus = 'parsed'
  let note: string | null = null
  if (pages.length > 0 && empty.length === pages.length) { status = 'ocr_needed'; note = 'No extractable text on any page — this looks like a scanned document. OCR is needed; the file can still be viewed and downloaded.' }
  else if (empty.length > 0) { note = `OCR needed for page${empty.length > 1 ? 's' : ''} ${empty.join(', ')} (little or no extractable text). Other pages were parsed.`; if (empty.length / pages.length >= 0.5) status = 'ocr_needed' }
  return { kind: 'pdf', pageCount: pages.length, pages, status, note }
}

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<\/(p|li|tr|div|h[1-6])>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/[ \t]+\n/g, '\n').replace(/ \| \n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** DOCX has no reliable page numbers: sections are split at headings and cited by heading. */
export async function extractDocx(data: Uint8Array): Promise<ExtractedDocument> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(data) })
  const parts = html.split(/(?=<h[1-6][^>]*>)/i)
  const sections: Array<{ heading: string | null; text: string }> = []
  for (const part of parts) {
    const m = part.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
    const heading = m ? htmlToText(m[1]) : null
    const text = htmlToText(m ? part.slice(m[0].length) : part)
    if (!heading && !text) continue
    sections.push({ heading, text })
  }
  // Documents whose headings are plain paragraphs ("C.3 Delivery"): split on detected headings too.
  const refined: typeof sections = []
  for (const s of sections) {
    let cur = { heading: s.heading, text: '' }
    for (const line of s.text.split('\n')) {
      const h = detectHeading(line)
      if (h) { if (cur.text.trim() || cur.heading) refined.push(cur); cur = { heading: h, text: '' } }
      else cur.text += (cur.text ? '\n' : '') + line
    }
    refined.push(cur)
  }
  const pages: ExtractedPage[] = refined.filter((s) => s.text.trim() || s.heading).map((s, i) => ({
    page: i + 1, section: s.heading ?? (i === 0 ? 'Document' : refined[i - 1]?.heading ?? null), locator: null,
    text: [s.heading, s.text].filter(Boolean).join('\n').trim(), pageReliable: false,
  }))
  const total = pages.reduce((n, p) => n + p.text.length, 0)
  return { kind: 'docx', pageCount: pages.length, pages, status: total > 0 ? 'parsed' : 'failed', note: total > 0 ? 'Page numbers are unavailable for Word documents; citations use section headings.' : 'The document contains no text.' }
}

const XLSX_ROWS_PER_CHUNK = 150
/** XLSX: cited by sheet name and cell range; large sheets are chunked, never truncated. */
export function extractXlsx(data: Uint8Array): ExtractedDocument {
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const pages: ExtractedPage[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) continue
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let r0 = range.s.r; r0 <= range.e.r; r0 += XLSX_ROWS_PER_CHUNK) {
      const r1 = Math.min(range.e.r, r0 + XLSX_ROWS_PER_CHUNK - 1)
      const lines: string[] = []
      for (let r = r0; r <= r1; r++) {
        const cells: string[] = []
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          cells.push(cell ? String(cell.w ?? cell.v ?? '').trim() : '')
        }
        if (cells.some(Boolean)) lines.push(`R${r + 1}: ${cells.join(' | ')}`)
      }
      if (!lines.length) continue
      const locator = `${name}!${XLSX.utils.encode_range({ s: { r: r0, c: range.s.c }, e: { r: r1, c: range.e.c } })}`
      pages.push({ page: pages.length + 1, section: name, locator, text: lines.join('\n'), pageReliable: false })
    }
  }
  return { kind: 'xlsx', pageCount: pages.length, pages, status: pages.length ? 'parsed' : 'failed', note: pages.length ? 'Cited by sheet name and cell range.' : 'The workbook contains no data.' }
}

export function extractTxt(data: Uint8Array): ExtractedDocument {
  const text = new TextDecoder('utf-8').decode(data).replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const pages: ExtractedPage[] = []
  const CHUNK = 120
  const sections = assignSections(Array.from({ length: Math.ceil(lines.length / CHUNK) }, (_, i) => lines.slice(i * CHUNK, (i + 1) * CHUNK).join('\n')))
  for (let i = 0; i * CHUNK < lines.length; i++) {
    const t = lines.slice(i * CHUNK, (i + 1) * CHUNK).join('\n').trim()
    if (t) pages.push({ page: pages.length + 1, section: sections[i] ?? 'Document', locator: null, text: t, pageReliable: false })
  }
  return { kind: 'txt', pageCount: pages.length, pages, status: pages.length ? 'parsed' : 'failed', note: 'Plain text has no pages; citations use sections.' }
}

export async function extractDocument(data: Uint8Array, fileName: string, mime?: string | null): Promise<ExtractedDocument> {
  const kind = kindFromName(fileName, mime)
  if (!kind) return { kind: 'txt', pageCount: 0, pages: [], status: 'failed', note: 'Unsupported file type. Supported: PDF, DOCX, XLSX, TXT.' }
  try {
    switch (kind) {
      case 'pdf': return await extractPdf(data)
      case 'docx': return await extractDocx(data)
      case 'xlsx': return extractXlsx(data)
      case 'txt': return extractTxt(data)
    }
  } catch (e) {
    return { kind, pageCount: 0, pages: [], status: 'failed', note: `Could not parse this file: ${e instanceof Error ? e.message : String(e)}` }
  }
}

import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { detectHeading, assignSections } from './sections'
import { extractDocument, extractDocx, extractPdf, extractXlsx } from './extract'

import { makePdf } from '../../tests/fixtures/pdf'

async function makeDocx(bodyXml: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  zip.file('word/styles.xml', '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`)
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }))
}
const p = (t: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${t}</w:t></w:r></w:p>`

describe('section detection', () => {
  it('detects solicitation headings', () => {
    expect(detectHeading('SECTION L - INSTRUCTIONS TO OFFERORS')).toMatch(/^SECTION L/)
    expect(detectHeading('C.3 Delivery Requirements')).toBe('C.3 Delivery Requirements')
    expect(detectHeading('The contractor shall deliver the items.')).toBeNull()
    expect(detectHeading('x')).toBeNull()
  })
  it('carries headings across pages', () => {
    expect(assignSections(['SECTION C - DESCRIPTION\nblah', 'more text', 'SECTION L - INSTRUCTIONS\nx'])).toEqual(['SECTION C - DESCRIPTION', 'SECTION C - DESCRIPTION', 'SECTION L - INSTRUCTIONS'])
  })
})

describe('PDF', () => {
  it('extracts text per page with page numbers and sections', async () => {
    const d = await extractPdf(makePdf(['SECTION B - SUPPLIES\nCLIN 0001 Hydraulic pump quantity 40 EA', 'SECTION F - DELIVERIES\nDelivery within 90 days ARO FOB Destination']))
    expect(d.pageCount).toBe(2)
    expect(d.status).toBe('parsed')
    expect(d.pages[0].text).toMatch(/CLIN 0001 Hydraulic pump quantity 40 EA/)
    expect(d.pages[1].page).toBe(2)
    expect(d.pages[1].section).toMatch(/SECTION F/)
    expect(d.pages.every((x) => x.pageReliable)).toBe(true)
  })
  it('flags blank pages as OCR needed and says which', async () => {
    const d = await extractPdf(makePdf(['Real text content on the first page of this document', '', 'Another page with real text content here ok']))
    expect(d.status).toBe('parsed')
    expect(d.note).toMatch(/OCR needed for page 2/)
  })
  it('marks an all-blank (scanned) PDF as ocr_needed rather than guessing', async () => {
    const d = await extractPdf(makePdf(['', '']))
    expect(d.status).toBe('ocr_needed')
    expect(d.note).toMatch(/scanned/)
  })
  it('reports garbage as failed instead of throwing', async () => {
    const d = await extractDocument(new TextEncoder().encode('not a pdf'), 'x.pdf')
    expect(d.status).toBe('failed')
    expect(d.note).toMatch(/Could not parse/)
  })
})

describe('DOCX', () => {
  it('splits by heading, cites by section, and says pages are unavailable', async () => {
    const buf = await makeDocx(p('Scope', 'Heading1') + p('The contractor shall provide pumps.') + p('C.3 Delivery') + p('Deliver to Redstone Arsenal, AL 35898.'))
    const d = await extractDocx(buf)
    expect(d.status).toBe('parsed')
    expect(d.pages.every((x) => !x.pageReliable)).toBe(true)
    expect(d.pages.map((x) => x.section)).toEqual(expect.arrayContaining(['Scope', 'C.3 Delivery']))
    expect(d.pages.find((x) => x.section === 'C.3 Delivery')!.text).toMatch(/Redstone Arsenal/)
    expect(d.note).toMatch(/Page numbers are unavailable/)
  })
})

describe('XLSX', () => {
  it('cites by sheet and cell range and keeps all rows', () => {
    const wb = XLSX.utils.book_new()
    const rows = [['CLIN', 'Description', 'Qty', 'Unit price'], ...Array.from({ length: 200 }, (_, i) => [`${String(i + 1).padStart(4, '0')}`, `Item ${i + 1}`, i + 1, ''])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Pricing')
    const d = extractXlsx(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })))
    expect(d.status).toBe('parsed')
    expect(d.pages.length).toBe(2) // 201 rows in chunks of 150
    expect(d.pages[0].section).toBe('Pricing')
    expect(d.pages[0].locator).toBe('Pricing!A1:D150')
    expect(d.pages[1].locator).toBe('Pricing!A151:D201')
    expect(d.pages[1].text).toMatch(/R201: 0200 \| Item 200 \| 200/)
  })
  it('rejects unsupported types clearly', async () => {
    expect((await extractDocument(new Uint8Array([1, 2]), 'x.exe')).note).toMatch(/Unsupported/)
  })
})

/** Build a minimal valid multi-page text PDF (Helvetica) — empty string = blank/scanned page. */
export function makePdf(pages: string[]): Uint8Array {
  const objs: string[] = []
  const kids: string[] = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let n = 4
  for (const text of pages) {
    const content = `BT /F1 12 Tf 72 720 Td 14 TL ${text.split('\n').map((l) => `(${l.replace(/[()\\]/g, '\\$&')}) Tj T*`).join(' ')} ET`
    const cid = n++, pid = n++
    objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cid} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    kids.push(`${pid} 0 R`)
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i < objs.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${objs[i]}\nendobj\n` }
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new TextEncoder().encode(pdf)
}


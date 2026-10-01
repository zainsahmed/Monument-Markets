import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDocument, kindFromName } from '@/lib/docs/extract'
import { buildIndex, type DocumentIndex } from '@/lib/ai/citations'
import type { OpportunityDocument } from '@/lib/db-types'

type Admin = ReturnType<typeof createAdminClient>
export const BUCKET = 'documents'

const safe = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120)

export class IngestError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/**
 * Store an original in the private bucket (checksum-deduped), extract page-indexed text, and record parse status.
 * `companyId` null = public SAM attachment shared across tenants; otherwise a private company upload.
 */
export async function ingestDocument(admin: Admin, a: { opportunityId: string; companyId: string | null; fileName: string; mime: string | null; bytes: Uint8Array; sourceUrl?: string | null; maxMb: number }): Promise<{ doc: OpportunityDocument; duplicate: boolean }> {
  if (a.bytes.byteLength > a.maxMb * 1024 * 1024) throw new IngestError(413, `File is larger than the ${a.maxMb} MB limit.`)
  if (!kindFromName(a.fileName, a.mime)) throw new IngestError(415, 'Unsupported file type. Supported: PDF, DOCX, XLSX, TXT.')
  const checksum = createHash('sha256').update(a.bytes).digest('hex')
  let q = admin.from('opportunity_documents').select('*').eq('opportunity_id', a.opportunityId).eq('checksum', checksum)
  q = a.companyId ? q.eq('company_id', a.companyId) : q.is('company_id', null)
  const { data: existing } = await q.maybeSingle()
  if (existing) return { doc: existing as OpportunityDocument, duplicate: true }

  const scope = a.companyId ?? 'public'
  const path = `${scope}/${a.opportunityId}/${checksum.slice(0, 16)}-${safe(a.fileName)}`
  const up = await admin.storage.from(BUCKET).upload(path, a.bytes, { contentType: a.mime ?? 'application/octet-stream', upsert: true })
  if (up.error) throw new IngestError(502, `Could not store the file: ${up.error.message}`)

  const ex = await extractDocument(a.bytes, a.fileName, a.mime)
  const { data: doc, error } = await admin.from('opportunity_documents').insert({
    opportunity_id: a.opportunityId, company_id: a.companyId, file_name: a.fileName, mime_type: a.mime, size_bytes: a.bytes.byteLength, storage_path: path, checksum,
    page_count: ex.pageCount, parse_status: ex.status, parse_error: ex.note, source_url: a.sourceUrl ?? null, fetched_at: new Date().toISOString(),
  }).select('*').single()
  if (error) throw new IngestError(500, error.message)
  if (ex.pages.length) {
    for (let i = 0; i < ex.pages.length; i += 100) {
      const { error: pe } = await admin.from('document_pages').insert(ex.pages.slice(i, i + 100).map((p) => ({ document_id: doc.id, page_number: p.page, section_heading: p.section, locator: p.locator, text: p.text, page_reliable: p.pageReliable })))
      if (pe) throw new IngestError(500, pe.message)
    }
  }
  return { doc: doc as OpportunityDocument, duplicate: false }
}

/** Short-lived signed URL (5 min) — documents are only ever reachable this way. */
export async function signedUrl(admin: Admin, path: string, download?: string): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download } : undefined)
  if (error || !data) throw new IngestError(502, 'Could not create a download link.')
  return data.signedUrl
}

/** Page-indexed text for every parsed document visible to the company (public + its own). */
export async function loadDocumentIndexes(admin: Admin, opportunityId: string, companyId: string): Promise<{ docs: OpportunityDocument[]; indexes: DocumentIndex[]; chars: number }> {
  const { data: docs } = await admin.from('opportunity_documents').select('*').eq('opportunity_id', opportunityId).or(`company_id.is.null,company_id.eq.${companyId}`).order('created_at')
  const parsed = ((docs ?? []) as OpportunityDocument[]).filter((d) => d.parse_status !== 'failed')
  const indexes: DocumentIndex[] = []
  let chars = 0
  for (const d of parsed) {
    const { data: pages } = await admin.from('document_pages').select('page_number, section_heading, locator, text, page_reliable').eq('document_id', d.id).order('page_number')
    if (!pages?.length) continue
    for (const p of pages) chars += p.text.length
    indexes.push({ documentId: d.id, name: d.file_name, pages: pages.map((p) => ({ page: p.page_number, section: p.section_heading, locator: p.locator, text: p.text, pageReliable: p.page_reliable })) })
  }
  return { docs: (docs ?? []) as OpportunityDocument[], indexes, chars }
}
export { buildIndex }

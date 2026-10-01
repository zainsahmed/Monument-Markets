import { handle, idParam, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestDocument } from '@/lib/opportunities/documents'

export const maxDuration = 120

/** User-supplied files (company-private): PDF, DOCX, XLSX, TXT up to the company's limit (default 50 MB). */
export async function POST(req: Request, ctx: RouteContext<'/api/opportunities/[id]/documents/upload'>) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const id = await idParam(ctx)
    const { data: allowed } = await session.supabase.from('opportunities').select('id').eq('id', id).maybeSingle()
    if (!allowed) throw new HttpError(404, 'Opportunity not found')
    const { data: ok } = await session.supabase.rpc('check_rate_limit', { p_bucket: 'upload', p_max: 60, p_window_seconds: 3600 })
    if (!ok) throw new HttpError(429, 'Too many uploads. Try again later.')
    const form = await req.formData()
    const files = form.getAll('file').filter((f): f is File => f instanceof File)
    if (!files.length) throw new HttpError(400, 'No file provided')
    const admin = createAdminClient()
    const out = []
    for (const f of files) {
      const { doc, duplicate } = await ingestDocument(admin, { opportunityId: id, companyId: session.companyId, fileName: f.name, mime: f.type || null, bytes: new Uint8Array(await f.arrayBuffer()), maxMb: session.company.max_upload_mb })
      out.push({ id: doc.id, name: doc.file_name, parseStatus: doc.parse_status, note: doc.parse_error, duplicate })
    }
    return json({ documents: out })
  })
}

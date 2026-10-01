import { z } from 'zod'
import { handle, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDocument } from '@/lib/docs/extract'
import { dibbsToOpportunity, parseDibbsRfq } from '@/lib/dibbs/parse'
import { ingestDocument } from '@/lib/opportunities/documents'
import { classify } from '@/lib/classification'

export const maxDuration = 120

/**
 * DIBBS manual import: upload an RFQ PDF/TXT export or paste its text. No scraping, no logins — the user
 * brings the data. Creates a company-private opportunity (source = DIBBS) that flows through the normal
 * brief / checklist / sourcing / pricing / pipeline features.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const { data: ok } = await session.supabase.rpc('check_rate_limit', { p_bucket: 'import', p_max: 30, p_window_seconds: 3600 })
    if (!ok) throw new HttpError(429, 'Too many imports. Try again later.')

    let text = ''
    let file: File | null = null
    const ctype = req.headers.get('content-type') ?? ''
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData()
      file = (form.get('file') as File | null) ?? null
      text = String(form.get('text') ?? '')
    } else {
      text = z.object({ text: z.string().min(20).max(500_000) }).parse(await req.json()).text
    }
    let bytes: Uint8Array | null = null
    if (file) {
      bytes = new Uint8Array(await file.arrayBuffer())
      const ex = await extractDocument(bytes, file.name, file.type)
      if (ex.status === 'failed') throw new HttpError(422, ex.note ?? 'Could not read that file.')
      if (ex.status === 'ocr_needed') throw new HttpError(422, 'This PDF has no extractable text (scanned). Paste the RFQ text instead, or OCR it first.')
      text = ex.pages.map((p) => p.text).join('\n')
    }
    if (text.trim().length < 20) throw new HttpError(400, 'Provide an RFQ file or paste its text.')

    const rfq = parseDibbsRfq(text)
    if (!rfq.nsn && !rfq.rfq_number) throw new HttpError(422, 'Could not find an RFQ number or NSN in that text. Check that it is a DIBBS RFQ.')
    const o = dibbsToOpportunity(rfq, text)
    const cls = classify({ noticeTypeCode: o.notice_type_code, active: true, responseDeadline: o.response_deadline })
    const admin = createAdminClient()
    const { data: existing } = await admin.from('opportunities').select('id').eq('source', 'DIBBS').eq('notice_id', o.notice_id).eq('company_id', session.companyId).maybeSingle()
    const row = { ...o, company_id: session.companyId, color_label: cls.label, content_hash: null }
    let oppId = existing?.id as string | undefined
    if (oppId) await admin.from('opportunities').update(row).eq('id', oppId)
    else {
      const { data, error } = await admin.from('opportunities').insert(row).select('id').single()
      if (error) throw new HttpError(500, error.message)
      oppId = data.id
    }
    await session.supabase.from('company_opportunities').upsert({ company_id: session.companyId, opportunity_id: oppId, saved: true }, { onConflict: 'company_id,opportunity_id' })
    if (file && bytes) await ingestDocument(admin, { opportunityId: oppId!, companyId: session.companyId, fileName: file.name, mime: file.type || null, bytes, maxMb: session.company.max_upload_mb })
    await session.supabase.from('activity_log').insert({ company_id: session.companyId, actor_id: session.user.id, entity_type: 'opportunity', entity_id: oppId, opportunity_id: oppId, action: existing ? 'dibbs_reimported' : 'dibbs_imported', after: { rfq: o.notice_id, missing: rfq.missing } })
    return json({ opportunityId: oppId, noticeId: o.notice_id, updated: !!existing, parsed: rfq, label: cls.label })
  })
}

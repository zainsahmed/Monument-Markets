import { handle, idParam, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'
import { getEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSamClient, SamQuotaError } from '@/lib/sam/client'
import { availableOnDemandCalls } from '@/lib/sam/plan'
import { recordOnDemandCalls, samCallsUsedToday } from '@/lib/sam/store'
import { ingestDocument, IngestError } from '@/lib/opportunities/documents'

export const maxDuration = 300

/**
 * On-demand: fetch the description text (1 SAM call) and download attachments (1 call each) into private storage.
 * Spends from today's remaining SAM quota; stops and reports when it runs out. The UI never calls SAM directly.
 */
export async function POST(_req: Request, ctx: RouteContext<'/api/opportunities/[id]/documents/fetch'>) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const id = await idParam(ctx)
    const env = getEnv()
    const { data: opp } = await session.supabase.from('opportunities').select('id, source, description, description_fetched_at, resource_links, raw').eq('id', id).maybeSingle()
    if (!opp) throw new HttpError(404, 'Opportunity not found')
    if (opp.source !== 'SAM') throw new HttpError(400, 'Only SAM notices have attachments to fetch. Upload DIBBS files directly.')
    const admin = createAdminClient()
    const sam = createSamClient()
    let budget = availableOnDemandCalls({ dailyQuota: env.SAM_DAILY_QUOTA, reserved: 0, usedToday: await samCallsUsedToday(admin) })
    const result = { descriptionFetched: false, fetched: [] as string[], duplicates: [] as string[], skipped: [] as string[], errors: [] as string[], remainingCalls: 0 }

    const descUrl = (opp.raw as { description?: string } | null)?.description
    if (!opp.description_fetched_at && descUrl?.startsWith('http') && budget > 0) {
      try {
        budget--
        const text = await sam.fetchDescription(descUrl)
        await recordOnDemandCalls(admin, 1, 'description')
        await admin.from('opportunities').update({ description: text, description_fetched_at: new Date().toISOString() }).eq('id', id)
        result.descriptionFetched = true
      } catch (e) {
        await recordOnDemandCalls(admin, 1, 'description', e instanceof Error ? e.message : String(e))
        if (e instanceof SamQuotaError) { result.errors.push('SAM.gov quota exhausted'); budget = 0 } else result.errors.push(`Description: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }

    const { data: have } = await admin.from('opportunity_documents').select('source_url').eq('opportunity_id', id).is('company_id', null)
    const haveUrls = new Set((have ?? []).map((d) => d.source_url))
    for (const url of (opp.resource_links as string[]) ?? []) {
      if (haveUrls.has(url)) { result.skipped.push(url); continue }
      if (budget <= 0) { result.skipped.push(url); continue }
      try {
        budget--
        const f = await sam.download(url)
        await recordOnDemandCalls(admin, 1, 'attachment')
        const name = f.fileName ?? decodeURIComponent(url.split('/').filter(Boolean).slice(-2, -1)[0] ?? 'attachment')
        const { doc, duplicate } = await ingestDocument(admin, { opportunityId: id, companyId: null, fileName: name, mime: f.contentType?.split(';')[0] ?? null, bytes: f.bytes, sourceUrl: url, maxMb: session.company.max_upload_mb })
        ;(duplicate ? result.duplicates : result.fetched).push(doc.file_name)
      } catch (e) {
        if (e instanceof SamQuotaError) { await recordOnDemandCalls(admin, 1, 'attachment', e.message); result.errors.push('SAM.gov quota exhausted'); budget = 0; continue }
        if (!(e instanceof IngestError)) await recordOnDemandCalls(admin, 1, 'attachment', e instanceof Error ? e.message : String(e))
        result.errors.push(`${url.split('/').slice(-2, -1)[0] ?? 'attachment'}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }
    result.remainingCalls = budget
    if (result.fetched.length) await session.supabase.from('activity_log').insert({ company_id: session.companyId, actor_id: session.user.id, entity_type: 'document', opportunity_id: id, entity_id: id, action: 'documents_fetched', after: { files: result.fetched } })
    return json(result)
  })
}

import { handle, idParam, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { runExtraction } from '@/lib/ai/service'

export const maxDuration = 300

export async function POST(_req: Request, ctx: RouteContext<'/api/opportunities/[id]/extract'>) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const out = await runExtraction(session, await idParam(ctx))
    return json({ analysisId: out.analysisId, costUsd: out.costUsd, citationRejections: out.stats.rejected, citationTotal: out.stats.total })
  })
}

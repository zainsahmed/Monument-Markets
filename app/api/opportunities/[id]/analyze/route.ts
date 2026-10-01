import { handle, idParam, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { runPursuitBrief } from '@/lib/ai/service'

export const maxDuration = 300

export async function POST(_req: Request, ctx: RouteContext<'/api/opportunities/[id]/analyze'>) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const out = await runPursuitBrief(session, await idParam(ctx))
    return json({ analysisId: out.analysisId, costUsd: out.costUsd, citationRejections: out.stats.rejected, citationTotal: out.stats.total, unparsedDocuments: out.unparsed })
  })
}

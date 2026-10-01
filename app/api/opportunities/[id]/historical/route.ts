import { z } from 'zod'
import { handle, idParam, json } from '@/lib/api'
import { HttpError, requireApiSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupHistoricalAwards } from '@/lib/usaspending'

export const maxDuration = 120
const CACHE_DAYS = 7

export async function POST(req: Request, ctx: RouteContext<'/api/opportunities/[id]/historical'>) {
  return handle(async () => {
    const session = await requireApiSession('member')
    const id = await idParam(ctx)
    const { force } = z.object({ force: z.boolean().default(false) }).parse(await req.json().catch(() => ({})))
    const { data: opp } = await session.supabase.from('opportunities').select('id, title, naics, psc, department, pop_state').eq('id', id).maybeSingle()
    if (!opp) throw new HttpError(404, 'Opportunity not found')
    const admin = createAdminClient()
    const { data: cached } = await admin.from('historical_lookups').select('fetched_at, strategies').eq('opportunity_id', id).maybeSingle()
    if (cached && !force && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_DAYS * 864e5) return json({ cached: true, fetchedAt: cached.fetched_at, strategies: cached.strategies })

    const result = await lookupHistoricalAwards(opp)
    // If every strategy failed keep the previous cache rather than wiping it.
    if (result.strategies.length > 0 && result.strategies.every((s) => s.error)) throw new HttpError(502, `USAspending lookup failed: ${result.strategies[0].error}`)
    if (result.awards.length) {
      for (let i = 0; i < result.awards.length; i += 200) {
        const { error } = await admin.from('historical_awards').upsert(result.awards.slice(i, i + 200).map((a) => ({ ...a, opportunity_id: id })), { onConflict: 'opportunity_id,award_id' })
        if (error) throw new HttpError(500, error.message)
      }
    }
    await admin.from('historical_lookups').upsert({ opportunity_id: id, fetched_at: new Date().toISOString(), strategies: result.strategies }, { onConflict: 'opportunity_id' })
    return json({ cached: false, count: result.awards.length, strategies: result.strategies })
  })
}

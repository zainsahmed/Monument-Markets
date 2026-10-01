import { z } from 'zod'
import { handle, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { queryOpportunities, SORTS, type SortKey } from '@/lib/data/opportunities'
import { FiltersSchema } from '@/lib/search'

/** List/search endpoint for the client table (infinite scroll) and the command palette. Reads the database only. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireApiSession('viewer')
    const sp = new URL(req.url).searchParams
    const filters = FiltersSchema.parse(sp.get('filters') ? JSON.parse(sp.get('filters')!) : { q: sp.get('q') ?? undefined })
    const { offset, limit, sort, dir } = z.object({
      offset: z.coerce.number().int().min(0).max(100000).default(0), limit: z.coerce.number().int().min(1).max(200).default(100),
      sort: z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).default('deadline'), dir: z.enum(['asc', 'desc']).optional(),
    }).parse(Object.fromEntries(sp))
    const out = await queryOpportunities(session, filters, { offset, limit, sort, dir, savedOnly: sp.get('saved') === '1' })
    return json({ rows: out.rows, total: out.total, nextOffset: out.rows.length === limit ? offset + limit : null })
  })
}

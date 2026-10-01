import { z } from 'zod'
import { handle, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { runAiSearch } from '@/lib/ai/service'
import { fromAiFilters, filterChips } from '@/lib/search'

/** Natural language → filters only. The AI never returns result rows; the UI runs the standard query with these editable filters. */
export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireApiSession('viewer')
    const { query } = z.object({ query: z.string().trim().min(3).max(500) }).parse(await req.json())
    const { filters, costUsd } = await runAiSearch(session, query)
    const std = fromAiFilters(filters)
    return json({ filters: std, chips: filterChips(std), unmapped: filters.unmapped, suggestions: filters.suggestions, costUsd })
  })
}

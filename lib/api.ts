import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from '@/lib/auth'
import { AiBudgetError, AiOutputError, AiRefusalError } from '@/lib/ai/run'
import { IngestError } from '@/lib/opportunities/documents'
import { SamQuotaError } from '@/lib/sam/client'

/** Wraps a route handler: consistent JSON errors, never leaks internals or secrets. */
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError || e instanceof IngestError) return json({ error: e.message }, e.status)
    if (e instanceof ZodError) return json({ error: 'Invalid request', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400)
    if (e instanceof AiBudgetError) return json({ error: e.message, code: 'ai_budget' }, 402)
    if (e instanceof AiRefusalError) return json({ error: `The model declined this request${e.category ? ` (${e.category})` : ''}. Nothing was saved.`, code: 'ai_refusal' }, 422)
    if (e instanceof AiOutputError) return json({ error: e.message, code: 'ai_output' }, 502)
    if (e instanceof SamQuotaError) return json({ error: 'SAM.gov daily quota is used up. Try again after the next reset.', code: 'sam_quota', nextAllowedAt: e.nextAllowedAt.toISOString() }, 429)
    console.error('route error', e instanceof Error ? e.message : e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
export const idParam = async (ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Invalid id')
  return id
}

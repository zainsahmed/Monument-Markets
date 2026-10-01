import 'server-only'
import type { ZodType, z } from 'zod'
import { HttpError, requireApiSession, type Session } from '@/lib/auth'
import type { Role } from '@/lib/db-types'

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Wraps a server action: authenticates, checks role, validates input with the shared Zod schema,
 * and returns a plain result object (never throws to the client, never leaks internals).
 */
export async function run<S extends ZodType, T>(minRole: Role, schema: S, input: unknown, fn: (s: Session, v: z.infer<S>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await requireApiSession(minRole)
    const parsed = schema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') }
    return { ok: true, data: await fn(session, parsed.data) }
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message }
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    console.error('action error', msg)
    return { ok: false, error: msg.length < 200 ? msg : 'Something went wrong.' }
  }
}

export async function log(s: Session, e: { entity: string; id?: string | null; opportunityId?: string | null; action: string; before?: unknown; after?: unknown }) {
  await s.supabase.from('activity_log').insert({ company_id: s.companyId, actor_id: s.user.id, entity_type: e.entity, entity_id: e.id ?? null, opportunity_id: e.opportunityId ?? null, action: e.action, before: e.before ?? null, after: e.after ?? null })
}

// Rows are untyped (no generated Database type without a live project), so results are `any` by design.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must(r: { data: any; error: { message: string } | null }): any {
  if (r.error) throw new HttpError(400, r.error.message)
  if (r.data === null || r.data === undefined) throw new HttpError(404, 'Not found')
  return r.data
}
export function check(r: { error: { message: string } | null }) {
  if (r.error) throw new HttpError(400, r.error.message)
}

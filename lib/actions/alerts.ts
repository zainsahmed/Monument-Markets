'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { run, check } from './core'
import { ALERT_TYPES } from '@/lib/alerts'
import { FiltersSchema } from '@/lib/search'

const uuid = z.string().uuid()
export async function markAlertRead(input: unknown) {
  return run('viewer', z.object({ id: uuid, read: z.boolean() }), input, async (s, v) => {
    check(await s.supabase.from('alerts').update({ read_at: v.read ? new Date().toISOString() : null }).eq('id', v.id))
    revalidatePath('/', 'layout')
    return {}
  })
}
export async function markAllRead(input: unknown) {
  return run('viewer', z.object({ type: z.string().optional() }), input, async (s, v) => {
    let q = s.supabase.from('alerts').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', s.user.id)
    if (v.type) q = q.eq('type', v.type)
    check(await q)
    revalidatePath('/', 'layout')
    return {}
  })
}
export async function savePreference(input: unknown) {
  return run('viewer', z.object({ type: z.enum(ALERT_TYPES.map((t) => t.type) as [string, ...string[]]), in_app: z.boolean(), email: z.boolean(), digest: z.boolean(), deadline_offsets: z.array(z.number().int().min(1).max(60)).max(6).optional() }), input, async (s, v) => {
    check(await s.supabase.from('alert_preferences').upsert({ user_id: s.user.id, ...v, ...(v.deadline_offsets ? { deadline_offsets: [...new Set(v.deadline_offsets)].sort((a, b) => b - a) } : {}) }, { onConflict: 'user_id,type' }))
    revalidatePath('/alerts/preferences')
    return {}
  })
}

export async function saveSearch(input: unknown) {
  return run('viewer', z.object({ name: z.string().trim().min(1).max(100), filters: FiltersSchema, alertsEnabled: z.boolean().default(false) }), input, async (s, v) => {
    check(await s.supabase.from('saved_searches').insert({ company_id: s.companyId, user_id: s.user.id, name: v.name, filters: v.filters, alerts_enabled: v.alertsEnabled }))
    revalidatePath('/', 'layout')
    return {}
  })
}
export async function toggleSearchAlerts(input: unknown) {
  return run('viewer', z.object({ id: uuid, enabled: z.boolean() }), input, async (s, v) => {
    check(await s.supabase.from('saved_searches').update({ alerts_enabled: v.enabled, last_checked_at: new Date().toISOString() }).eq('id', v.id))
    revalidatePath('/searches')
    return {}
  })
}
export async function deleteSearch(input: unknown) {
  return run('viewer', z.object({ id: uuid }), input, async (s, v) => {
    check(await s.supabase.from('saved_searches').delete().eq('id', v.id))
    revalidatePath('/', 'layout')
    return {}
  })
}

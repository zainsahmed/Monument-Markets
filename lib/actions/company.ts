'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CompanySchema } from '@/lib/schemas'
import { run, log, must, check } from './core'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { HttpError } from '@/lib/auth'
import { DEFAULT_TEMPLATE } from '@/lib/checklist'

/** First sign-in: create the company and become its owner. */
export async function createCompany(input: unknown) {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(200) }).safeParse(input)
    if (!parsed.success) return { ok: false as const, error: 'Company name is required' }
    const supabase = await createClient()
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return { ok: false as const, error: 'Not signed in' }
    const { data, error } = await supabase.rpc('create_company', { p_name: parsed.data.name })
    if (error) return { ok: false as const, error: error.message }
    await supabase.from('profiles').upsert({ user_id: u.user.id, full_name: u.user.email?.split('@')[0] ?? null }, { onConflict: 'user_id' })
    revalidatePath('/', 'layout')
    return { ok: true as const, data: { id: data as string } }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Failed' }
  }
}

/** Company profile edits are owner-only (RLS enforces the same rule). */
export async function updateCompany(input: unknown) {
  return run('owner', CompanySchema.partial(), input, async (s, v) => {
    const before = must(await s.supabase.from('companies').select('*').eq('id', s.companyId).single())
    check(await s.supabase.from('companies').update(v).eq('id', s.companyId))
    const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => JSON.stringify(before[k]) !== JSON.stringify(val)))
    if (Object.keys(changed).length) await log(s, { entity: 'company', id: s.companyId, action: 'profile_updated', before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k]])), after: changed })
    revalidatePath('/', 'layout')
    return {}
  })
}
export async function finishOnboarding() {
  return run('owner', z.object({}), {}, async (s) => {
    check(await s.supabase.from('companies').update({ onboarded_at: new Date().toISOString() }).eq('id', s.companyId))
    revalidatePath('/', 'layout')
    return {}
  })
}
export async function updateLimits(input: unknown) {
  return run('owner', z.object({ ai_monthly_cap_usd: z.number().min(0).max(100000), max_upload_mb: z.number().int().min(1).max(500) }), input, async (s, v) => {
    check(await s.supabase.from('companies').update(v).eq('id', s.companyId))
    await log(s, { entity: 'company', id: s.companyId, action: 'limits_updated', after: v })
    revalidatePath('/settings')
    return {}
  })
}

export async function saveChecklistTemplate(input: unknown) {
  return run('owner', z.object({ items: z.array(z.object({ group: z.enum(['Eligibility', 'Defense compliance', 'Performance', 'Commercial']), key: z.string().regex(/^[a-z0-9_]{2,60}$/), label: z.string().trim().min(2).max(200) })).min(1).max(100) }), input, async (s, v) => {
    if (new Set(v.items.map((i) => i.key)).size !== v.items.length) throw new HttpError(400, 'Checklist keys must be unique')
    check(await s.supabase.from('checklist_templates').upsert({ company_id: s.companyId, items: v.items }, { onConflict: 'company_id' }))
    await log(s, { entity: 'checklist_template', action: 'template_saved', after: { count: v.items.length } })
    revalidatePath('/settings')
    return {}
  })
}
export async function resetChecklistTemplate() {
  return run('owner', z.object({}), {}, async (s) => {
    check(await s.supabase.from('checklist_templates').delete().eq('company_id', s.companyId))
    return { items: DEFAULT_TEMPLATE }
  })
}

/** Team: owners add by email. Existing users join immediately; others get an invite that is accepted at first sign-in. */
export async function inviteMember(input: unknown) {
  return run('owner', z.object({ email: z.string().email().max(200), role: z.enum(['owner', 'member', 'viewer']) }), input, async (s, v) => {
    const email = v.email.toLowerCase()
    const admin = createAdminClient()
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = users?.users.find((u) => u.email?.toLowerCase() === email)
    if (existing) {
      check(await s.supabase.from('company_members').upsert({ company_id: s.companyId, user_id: existing.id, role: v.role }, { onConflict: 'company_id,user_id' }))
    } else {
      check(await s.supabase.from('company_invites').upsert({ company_id: s.companyId, email, role: v.role, invited_by: s.user.id }, { onConflict: 'company_id,email' }))
    }
    await log(s, { entity: 'member', action: existing ? 'member_added' : 'member_invited', after: { email, role: v.role } })
    revalidatePath('/settings')
    return { joined: !!existing }
  })
}
export async function changeMemberRole(input: unknown) {
  return run('owner', z.object({ memberId: z.string().uuid(), role: z.enum(['owner', 'member', 'viewer']) }), input, async (s, v) => {
    check(await s.supabase.from('company_members').update({ role: v.role }).eq('id', v.memberId))
    await log(s, { entity: 'member', id: v.memberId, action: 'member_role_changed', after: { role: v.role } })
    revalidatePath('/settings')
    return {}
  })
}
export async function removeMember(input: unknown) {
  return run('owner', z.object({ memberId: z.string().uuid() }), input, async (s, v) => {
    check(await s.supabase.from('company_members').delete().eq('id', v.memberId))
    await log(s, { entity: 'member', id: v.memberId, action: 'member_removed' })
    revalidatePath('/settings')
    return {}
  })
}
export async function revokeInvite(input: unknown) {
  return run('owner', z.object({ id: z.string().uuid() }), input, async (s, v) => {
    check(await s.supabase.from('company_invites').delete().eq('id', v.id))
    revalidatePath('/settings')
    return {}
  })
}

export async function savePreferences(input: unknown) {
  return run('viewer', z.object({ theme: z.enum(['system', 'light', 'dark']).optional(), density: z.enum(['compact', 'comfortable']).optional(), columns: z.record(z.string(), z.boolean()).optional(), fullName: z.string().max(200).optional() }), input, async (s, v) => {
    const { data: p } = await s.supabase.from('profiles').select('preferences').eq('user_id', s.user.id).maybeSingle()
    const prefs = { ...(p?.preferences ?? {}), ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'fullName')) }
    check(await s.supabase.from('profiles').upsert({ user_id: s.user.id, preferences: prefs, ...(v.fullName !== undefined ? { full_name: v.fullName } : {}) }, { onConflict: 'user_id' }))
    return {}
  })
}

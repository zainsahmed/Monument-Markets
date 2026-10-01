import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Company, Role } from '@/lib/db-types'

export interface Session {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; email: string | null }
  companyId: string
  role: Role
  company: Company
}

/** Signed-in user with company membership; redirects to sign-in / onboarding for pages. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null
  const { data: members } = await supabase.from('company_members').select('company_id, role, created_at').order('created_at', { ascending: true })
  let member: { company_id: string; role: string } | undefined = members?.[0]
  if (!member) {
    await supabase.rpc('accept_invites')
    const retry = await supabase.from('company_members').select('company_id, role').order('created_at', { ascending: true })
    member = retry.data?.[0]
  }
  if (!member) return { supabase, user: { id: user.id, email: user.email ?? null }, companyId: '', role: 'viewer', company: null as unknown as Company }
  const { data: company } = await supabase.from('companies').select('*').eq('id', member.company_id).single()
  return { supabase, user: { id: user.id, email: user.email ?? null }, companyId: member.company_id, role: member.role as Role, company: company as Company }
})

export async function requirePageSession(): Promise<Session> {
  const s = await getSession()
  if (!s) redirect('/sign-in')
  if (!s.companyId) redirect('/onboarding')
  return s
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** For API routes / server actions: throws HttpError instead of redirecting. */
export async function requireApiSession(minRole: Role = 'viewer'): Promise<Session> {
  const s = await getSession()
  if (!s) throw new HttpError(401, 'Not signed in')
  if (!s.companyId) throw new HttpError(403, 'No company membership')
  const rank = { viewer: 0, member: 1, owner: 2 } as const
  if (rank[s.role] < rank[minRole]) throw new HttpError(403, `Requires ${minRole} role`)
  return s
}

export const canWrite = (r: Role) => r === 'owner' || r === 'member'

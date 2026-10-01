import type { Metadata } from 'next'
import { SettingsView } from '@/components/app/SettingsView'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'
import { syncStatus } from '@/lib/data/dashboard'
import { DEFAULT_TEMPLATE } from '@/lib/checklist'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const s = await requirePageSession()
  const admin = createAdminClient()
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const [members, invites, tpl, spend, analyses, audit, sync, prof] = await Promise.all([
    s.supabase.from('company_members').select('id, user_id, role, created_at').order('created_at'),
    s.role === 'owner' ? s.supabase.from('company_invites').select('id, email, role, accepted_at').is('accepted_at', null) : Promise.resolve({ data: [] as never[] }),
    s.supabase.from('checklist_templates').select('items').eq('company_id', s.companyId).maybeSingle(),
    s.supabase.rpc('ai_spend_this_month', { cid: s.companyId }),
    s.supabase.from('ai_analyses').select('id, created_at, kind, model, cost_usd, input_tokens, output_tokens, cache_read_tokens, status, citation_rejections, citation_total').gte('created_at', monthStart).order('created_at', { ascending: false }).limit(50),
    s.supabase.from('activity_log').select('id, created_at, actor_id, entity_type, action, after').order('created_at', { ascending: false }).limit(60),
    syncStatus(s),
    s.supabase.from('profiles').select('user_id, full_name'),
  ])
  const names = new Map((prof.data ?? []).map((p: any) => [p.user_id, p.full_name as string | null]))
  const mem = await Promise.all((members.data ?? []).map(async (m: any) => { const { data } = await admin.auth.admin.getUserById(m.user_id); return { id: m.id as string, user_id: m.user_id as string, role: m.role as string, email: data.user?.email ?? 'Unknown', name: (names.get(m.user_id) as string | null) ?? null } }))
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsView role={s.role} me={s.user.id} company={{ ai_monthly_cap_usd: Number(s.company.ai_monthly_cap_usd), max_upload_mb: s.company.max_upload_mb }}
        members={mem} invites={(invites.data ?? []) as any} template={(tpl.data?.items as typeof DEFAULT_TEMPLATE | undefined) ?? DEFAULT_TEMPLATE} customTemplate={!!tpl.data}
        spend={Number(spend.data ?? 0)} analyses={(analyses.data ?? []) as any} audit={((audit.data ?? []) as any[]).map((a) => ({ ...a, actor: a.actor_id ? names.get(a.actor_id) ?? 'Team member' : 'System' }))} sync={sync}
        samConfigured={!!process.env.SAM_API_KEY} />
    </>
  )
}

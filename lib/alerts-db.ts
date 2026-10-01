import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { alertTypeForDiff, type FieldDiff } from '@/lib/sam/hash'
import { ALERT_TAB, DEFAULT_OFFSETS, changeKey, planDeadlineAlerts, type AlertType, type PlannedAlert } from '@/lib/alerts'
import { applyFilters, FiltersSchema } from '@/lib/search'

type Admin = ReturnType<typeof createAdminClient>
const TRACKED = (q: any) => q.or('saved.eq.true,workflow_status.in.(pursue,review),pipeline_stage.not.is.null')

/** Insert alerts (deduped by key) honouring per-user in-app preferences. Returns how many were new. */
export async function createAlerts(admin: Admin, alerts: PlannedAlert[]): Promise<number> {
  if (!alerts.length) return 0
  const userIds = [...new Set(alerts.map((a) => a.userId))]
  const { data: prefs } = await admin.from('alert_preferences').select('user_id, type, in_app').in('user_id', userIds)
  const off = new Set((prefs ?? []).filter((p) => p.in_app === false).map((p) => `${p.user_id}:${p.type}`))
  const rows = alerts.filter((a) => !off.has(`${a.userId}:${a.type}`)).map((a) => ({
    dedupe_key: a.dedupeKey, user_id: a.userId, company_id: a.companyId, opportunity_id: a.opportunityId, type: a.type, title: a.title, link_tab: ALERT_TAB[a.type], payload: a.payload,
  }))
  if (!rows.length) return 0
  const { data, error } = await admin.from('alerts').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** Everyone who is actively tracking an opportunity (saved / pursuing / reviewing / in pipeline). */
export async function trackers(admin: Admin, opportunityId: string): Promise<Array<{ userId: string; companyId: string; companyOpportunityId: string }>> {
  const { data: cos } = await TRACKED(admin.from('company_opportunities').select('id, company_id').eq('opportunity_id', opportunityId))
  const out: Array<{ userId: string; companyId: string; companyOpportunityId: string }> = []
  for (const co of (cos ?? []) as Array<{ id: string; company_id: string }>) {
    const { data: members } = await admin.from('company_members').select('user_id').eq('company_id', co.company_id)
    for (const m of members ?? []) out.push({ userId: m.user_id, companyId: co.company_id, companyOpportunityId: co.id })
  }
  return out
}

const FIELD_LABEL: Record<string, string> = { title: 'title', notice_type: 'notice type', response_deadline: 'deadline', archive_date: 'archive date', naics: 'NAICS', psc: 'PSC', set_aside_code: 'set-aside', active: 'status', cancelled: 'cancellation', award: 'award', contacts: 'contacts', resource_links: 'attachments', solicitation_number: 'solicitation #' }

/** Amendment / deadline-changed / new-attachment alerts + audit trail for a changed notice. */
export async function notifyOpportunityChange(admin: Admin, c: { opportunityId: string; title: string; contentHash: string; diffs: FieldDiff[] }) {
  const t = await trackers(admin, c.opportunityId)
  const byType = new Map<AlertType, FieldDiff[]>()
  for (const d of c.diffs) {
    const type = alertTypeForDiff(d) as AlertType
    byType.set(type, [...(byType.get(type) ?? []), d])
  }
  const planned: PlannedAlert[] = []
  for (const [type, diffs] of byType) {
    const fields = diffs.map((d) => FIELD_LABEL[d.field] ?? d.field)
    const title = type === 'deadline_changed' ? `Deadline changed: ${c.title}` : type === 'new_attachment' ? `New attachment: ${c.title}` : `Amended (${fields.join(', ')}): ${c.title}`
    for (const u of t) planned.push({ dedupeKey: changeKey(type, u.userId, c.opportunityId, c.contentHash), userId: u.userId, companyId: u.companyId, opportunityId: c.opportunityId, type, title, payload: { fields: diffs.map((d) => d.field) } })
  }
  await createAlerts(admin, planned)
  const companies = [...new Set(t.map((x) => x.companyId))]
  if (companies.length) {
    await admin.from('activity_log').insert(companies.map((company_id) => ({ company_id, actor_id: null, entity_type: 'opportunity', opportunity_id: c.opportunityId, entity_id: c.opportunityId, action: 'amendment_detected', before: Object.fromEntries(c.diffs.map((d) => [d.field, d.old])), after: Object.fromEntries(c.diffs.map((d) => [d.field, d.new])) })))
  }
}

/** Daily: deadline reminders for tracked, still-open opportunities. */
export async function deadlineSweep(admin: Admin, now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 31 * 864e5).toISOString()
  const { data: opps } = await admin.from('opportunities').select('id, title, response_deadline').eq('active', true).gt('response_deadline', now.toISOString()).lt('response_deadline', horizon)
  const planned: PlannedAlert[] = []
  for (const o of opps ?? []) {
    for (const u of await trackers(admin, o.id)) {
      const { data: pref } = await admin.from('alert_preferences').select('deadline_offsets').eq('user_id', u.userId).eq('type', 'deadline').maybeSingle()
      planned.push(...planDeadlineAlerts([{ userId: u.userId, companyId: u.companyId, opportunityId: o.id, title: o.title, deadline: o.response_deadline as string, offsets: pref?.deadline_offsets ?? DEFAULT_OFFSETS }], now))
    }
  }
  return createAlerts(admin, planned)
}

/** Quotes whose validity ends before the offer deadline. */
export async function quoteExpirySweep(admin: Admin, now = new Date()): Promise<number> {
  const { data: quotes } = await admin.from('supplier_quotes').select('id, company_id, valid_until, company_opportunity_id, amount').not('company_opportunity_id', 'is', null).not('valid_until', 'is', null)
  const planned: PlannedAlert[] = []
  for (const q of quotes ?? []) {
    const { data: co } = await admin.from('company_opportunities').select('opportunity_id, opportunities(title, response_deadline)').eq('id', q.company_opportunity_id as string).maybeSingle()
    const opp = (co as any)?.opportunities as { title: string; response_deadline: string | null } | undefined
    if (!co || !opp?.response_deadline) continue
    const expires = new Date(`${q.valid_until}T23:59:59Z`).getTime()
    if (expires >= new Date(opp.response_deadline).getTime() || new Date(opp.response_deadline).getTime() < now.getTime()) continue
    const { data: members } = await admin.from('company_members').select('user_id').eq('company_id', q.company_id).in('role', ['owner', 'member'])
    for (const m of members ?? []) planned.push({ dedupeKey: changeKey('quote_expiring', m.user_id, co.opportunity_id, q.id), userId: m.user_id, companyId: q.company_id, opportunityId: co.opportunity_id, type: 'quote_expiring', title: `Quote expires ${q.valid_until}, before the offer deadline: ${opp.title}`, payload: { quote_id: q.id } })
  }
  return createAlerts(admin, planned)
}

/** After each sync: run alert-enabled saved searches against newly inserted notices. */
export async function savedSearchSweep(admin: Admin): Promise<number> {
  const { data: searches } = await admin.from('saved_searches').select('*').eq('alerts_enabled', true)
  let total = 0
  for (const s of searches ?? []) {
    const parsed = FiltersSchema.safeParse(s.filters)
    if (!parsed.success) continue
    let q: any = admin.from('opportunities').select('id, title').gt('created_at', s.last_checked_at).or(`company_id.is.null,company_id.eq.${s.company_id}`).order('created_at', { ascending: false }).limit(25)
    q = applyFilters(q, { ...parsed.data, q: undefined })
    if (parsed.data.q) {
      const { data } = await admin.rpc('search_opportunity_ids', { q: parsed.data.q, lim: 5000 })
      const ids = (data ?? []).map((r: { opportunity_id: string }) => r.opportunity_id)
      if (!ids.length) { await admin.from('saved_searches').update({ last_checked_at: new Date().toISOString() }).eq('id', s.id); continue }
      q = q.in('id', ids)
    }
    const { data: hits } = await q
    const planned: PlannedAlert[] = (hits ?? []).map((o: { id: string; title: string }) => ({ dedupeKey: changeKey('new_match', s.user_id, o.id, s.id), userId: s.user_id, companyId: s.company_id, opportunityId: o.id, type: 'new_match' as const, title: `New match for “${s.name}”: ${o.title}`, payload: { saved_search_id: s.id } }))
    total += await createAlerts(admin, planned)
    await admin.from('saved_searches').update({ last_checked_at: new Date().toISOString() }).eq('id', s.id)
  }
  return total
}

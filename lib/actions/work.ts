'use server'
import { revalidatePath } from 'next/cache'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { PricingSaveSchema } from '@/lib/schemas'
import { run, log, must, check } from './core'
import { DEFAULT_TEMPLATE } from '@/lib/checklist'
import { HttpError } from '@/lib/auth'

const uuid = z.string().uuid()
const status = z.enum(['PASS', 'FAIL', 'UNKNOWN', 'NA'])
const NOTE_HTML = { allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'h3', 'blockquote', 'code'], allowedAttributes: { a: ['href'] }, allowedSchemes: ['http', 'https', 'mailto'] }

/** Checklist: only a signed-in user sets a status (the DB also refuses PASS from the service role). */
export async function ensureChecklist(input: unknown) {
  return run('member', z.object({ coId: uuid }), input, async (s, v) => {
    const { data: tpl } = await s.supabase.from('checklist_templates').select('items').eq('company_id', s.companyId).maybeSingle()
    const items = (tpl?.items as typeof DEFAULT_TEMPLATE | undefined) ?? DEFAULT_TEMPLATE
    check(await s.supabase.from('checklist_items').upsert(items.map((i) => ({ company_id: s.companyId, company_opportunity_id: v.coId, group: i.group, key: i.key, label: i.label })), { onConflict: 'company_opportunity_id,key', ignoreDuplicates: true }))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}
export async function setChecklistStatus(input: unknown) {
  return run('member', z.object({ itemId: uuid, status, note: z.string().max(2000).optional() }), input, async (s, v) => {
    const before = must(await s.supabase.from('checklist_items').select('status, key, company_opportunity_id').eq('id', v.itemId).single())
    check(await s.supabase.from('checklist_items').update({ status: v.status, ...(v.note !== undefined ? { note: v.note } : {}) }).eq('id', v.itemId))
    await log(s, { entity: 'checklist_item', id: v.itemId, action: 'checklist_status_changed', before: { status: before.status, key: before.key }, after: { status: v.status } })
    return { previous: before.status as string }
  })
}
export async function setChecklistNote(input: unknown) {
  return run('member', z.object({ itemId: uuid, note: z.string().max(2000), evidence: z.object({ label: z.string().max(200), url: z.string().url().max(500).optional(), documentId: uuid.optional(), page: z.number().int().optional() }).nullable().optional() }), input, async (s, v) => {
    check(await s.supabase.from('checklist_items').update({ note: v.note, ...(v.evidence !== undefined ? { evidence: v.evidence } : {}) }).eq('id', v.itemId))
    return {}
  })
}
/** Accepting an AI suggestion is an explicit user action — it records the user as the setter. */
export async function acceptSuggestion(input: unknown) {
  return run('member', z.object({ itemId: uuid }), input, async (s, v) => {
    const it = must(await s.supabase.from('checklist_items').select('ai_suggestion, status').eq('id', v.itemId).single())
    const sug = it.ai_suggestion as { status?: string } | null
    if (!sug?.status || !['PASS', 'FAIL', 'UNKNOWN', 'NA'].includes(sug.status)) throw new HttpError(400, 'No suggestion to accept')
    check(await s.supabase.from('checklist_items').update({ status: sug.status }).eq('id', v.itemId))
    await log(s, { entity: 'checklist_item', id: v.itemId, action: 'ai_suggestion_accepted', before: { status: it.status }, after: { status: sug.status } })
    return { previous: it.status as string }
  })
}

export async function addNote(input: unknown) {
  return run('member', z.object({ coId: uuid, body: z.string().min(1).max(20000) }), input, async (s, v) => {
    const clean = sanitizeHtml(v.body, NOTE_HTML).trim()
    if (!clean) throw new HttpError(400, 'Note is empty')
    const n = must(await s.supabase.from('notes').insert({ company_id: s.companyId, company_opportunity_id: v.coId, author_id: s.user.id, body: clean }).select('id').single())
    await log(s, { entity: 'note', id: n.id, action: 'note_added' })
    revalidatePath('/opportunities/[id]', 'page')
    return { id: n.id }
  })
}
export async function deleteNote(input: unknown) {
  return run('member', z.object({ id: uuid }), input, async (s, v) => {
    const before = must(await s.supabase.from('notes').select('body').eq('id', v.id).single())
    check(await s.supabase.from('notes').delete().eq('id', v.id))
    await log(s, { entity: 'note', id: v.id, action: 'note_deleted', before })
    revalidatePath('/opportunities/[id]', 'page')
    return { body: before.body as string }
  })
}
export async function restoreNote(input: unknown) {
  return run('member', z.object({ coId: uuid, body: z.string().min(1) }), input, async (s, v) => {
    check(await s.supabase.from('notes').insert({ company_id: s.companyId, company_opportunity_id: v.coId, author_id: s.user.id, body: sanitizeHtml(v.body, NOTE_HTML) }))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}

export async function addTask(input: unknown) {
  return run('member', z.object({ coId: uuid, title: z.string().trim().min(1).max(300), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), assigneeId: uuid.optional() }), input, async (s, v) => {
    check(await s.supabase.from('tasks').insert({ company_id: s.companyId, company_opportunity_id: v.coId, title: v.title, due_date: v.dueDate ?? null, assignee_id: v.assigneeId ?? null }))
    revalidatePath('/opportunities/[id]', 'page'); revalidatePath('/pipeline')
    return {}
  })
}
export async function toggleTask(input: unknown) {
  return run('member', z.object({ id: uuid, done: z.boolean() }), input, async (s, v) => {
    check(await s.supabase.from('tasks').update({ done: v.done }).eq('id', v.id))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}
export async function deleteTask(input: unknown) {
  return run('member', z.object({ id: uuid }), input, async (s, v) => {
    check(await s.supabase.from('tasks').delete().eq('id', v.id))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}

/** Each save creates a new version so scenarios can be compared. */
export async function savePricing(input: unknown) {
  return run('member', PricingSaveSchema, input, async (s, v) => {
    const { data: last } = await s.supabase.from('pricing').select('version').eq('company_opportunity_id', v.coId).order('version', { ascending: false }).limit(1)
    const version = (last?.[0]?.version ?? 0) + 1
    const p = must(await s.supabase.from('pricing').insert({ company_id: s.companyId, company_opportunity_id: v.coId, version, label: v.label ?? null, desired_margin: v.desiredMargin, target_price: v.targetPrice, notes: v.notes ?? null, is_estimated: v.isEstimated, created_by: s.user.id }).select('id').single())
    if (v.lines.length) check(await s.supabase.from('pricing_lines').insert(v.lines.map((l, i) => ({ ...l, company_id: s.companyId, pricing_id: p.id, position: i }))))
    await log(s, { entity: 'pricing', id: p.id, action: 'pricing_saved', after: { version, estimated: v.isEstimated, lines: v.lines.length } })
    revalidatePath('/opportunities/[id]', 'page')
    return { version }
  })
}

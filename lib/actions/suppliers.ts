'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { SupplierSchema, SOURCING_STEPS } from '@/lib/schemas'
import { run, log, must, check } from './core'
import { createAdminClient } from '@/lib/supabase/admin'
import { HttpError } from '@/lib/auth'

const uuid = z.string().uuid()
export async function saveSupplier(input: unknown) {
  return run('member', z.object({ id: uuid.optional(), data: SupplierSchema }), input, async (s, v) => {
    if (v.id) {
      const before = must(await s.supabase.from('suppliers').select('*').eq('id', v.id).single())
      check(await s.supabase.from('suppliers').update(v.data).eq('id', v.id))
      await log(s, { entity: 'supplier', id: v.id, action: 'supplier_updated', before, after: v.data })
      revalidatePath('/suppliers'); revalidatePath(`/suppliers/${v.id}`)
      return { id: v.id }
    }
    const row = must(await s.supabase.from('suppliers').insert({ ...v.data, company_id: s.companyId }).select('id').single())
    await log(s, { entity: 'supplier', id: row.id, action: 'supplier_created', after: v.data })
    revalidatePath('/suppliers')
    return { id: row.id as string }
  })
}
export async function deleteSupplier(input: unknown) {
  return run('member', z.object({ id: uuid }), input, async (s, v) => {
    const before = must(await s.supabase.from('suppliers').select('*').eq('id', v.id).single())
    check(await s.supabase.from('suppliers').delete().eq('id', v.id))
    await log(s, { entity: 'supplier', id: v.id, action: 'supplier_deleted', before })
    revalidatePath('/suppliers')
    return { snapshot: before as Record<string, unknown> }
  })
}
/** Undo for supplier deletion (quotes are not restored — they were cascade-deleted; the UI says so before deleting). */
export async function restoreSupplier(input: unknown) {
  return run('member', z.object({ snapshot: SupplierSchema.extend({ id: uuid }) }), input, async (s, v) => {
    check(await s.supabase.from('suppliers').insert({ ...v.snapshot, company_id: s.companyId }))
    revalidatePath('/suppliers')
    return {}
  })
}

export async function addQuote(input: unknown) {
  return run('member', z.object({ supplierId: uuid, coId: uuid.optional(), amount: z.number().positive().max(1e10), quoteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z.string().max(2000).optional() }), input, async (s, v) => {
    if (v.validUntil && v.validUntil < v.quoteDate) throw new HttpError(400, 'A quote cannot expire before it was issued.')
    const q = must(await s.supabase.from('supplier_quotes').insert({ company_id: s.companyId, supplier_id: v.supplierId, company_opportunity_id: v.coId ?? null, amount: v.amount, quote_date: v.quoteDate, valid_until: v.validUntil ?? null, notes: v.notes ?? null }).select('id').single())
    await log(s, { entity: 'supplier_quote', id: q.id, action: 'quote_added', after: { amount: v.amount, supplier_id: v.supplierId } })
    revalidatePath('/suppliers/[id]', 'page'); revalidatePath('/opportunities/[id]', 'page')
    return { id: q.id as string }
  })
}
export async function deleteQuote(input: unknown) {
  return run('member', z.object({ id: uuid }), input, async (s, v) => {
    const before = must(await s.supabase.from('supplier_quotes').select('*').eq('id', v.id).single())
    check(await s.supabase.from('supplier_quotes').delete().eq('id', v.id))
    await log(s, { entity: 'supplier_quote', id: v.id, action: 'quote_deleted', before })
    revalidatePath('/suppliers/[id]', 'page'); revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}

/** Quote files live in the private bucket under the company folder; the path is saved on the quote. */
export async function attachQuoteFile(formData: FormData) {
  return run('member', z.object({ quoteId: uuid }), { quoteId: formData.get('quoteId') }, async (s, v) => {
    const f = formData.get('file')
    if (!(f instanceof File) || f.size === 0) throw new HttpError(400, 'No file')
    if (f.size > s.company.max_upload_mb * 1024 * 1024) throw new HttpError(413, `File is larger than ${s.company.max_upload_mb} MB`)
    must(await s.supabase.from('supplier_quotes').select('id').eq('id', v.quoteId).single()) // RLS: proves access
    const path = `${s.companyId}/quotes/${v.quoteId}-${f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 100)}`
    const up = await createAdminClient().storage.from('documents').upload(path, new Uint8Array(await f.arrayBuffer()), { contentType: f.type || 'application/octet-stream', upsert: true })
    if (up.error) throw new HttpError(502, up.error.message)
    check(await s.supabase.from('supplier_quotes').update({ file_path: path }).eq('id', v.quoteId))
    revalidatePath('/suppliers/[id]', 'page')
    return { path }
  })
}

export async function attachSupplier(input: unknown) {
  return run('member', z.object({ coId: uuid, supplierId: uuid }), input, async (s, v) => {
    check(await s.supabase.from('opportunity_suppliers').upsert({ company_id: s.companyId, company_opportunity_id: v.coId, supplier_id: v.supplierId, sourcing_checklist: { supplier_found: true } }, { onConflict: 'company_opportunity_id,supplier_id', ignoreDuplicates: true }))
    await log(s, { entity: 'opportunity_supplier', action: 'supplier_attached', after: v })
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}
export async function detachSupplier(input: unknown) {
  return run('member', z.object({ id: uuid }), input, async (s, v) => {
    check(await s.supabase.from('opportunity_suppliers').delete().eq('id', v.id))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}
export async function setSourcingStep(input: unknown) {
  return run('member', z.object({ id: uuid, step: z.enum(SOURCING_STEPS.map((x) => x[0]) as [string, ...string[]]), done: z.boolean() }), input, async (s, v) => {
    const row = must(await s.supabase.from('opportunity_suppliers').select('sourcing_checklist').eq('id', v.id).single())
    check(await s.supabase.from('opportunity_suppliers').update({ sourcing_checklist: { ...(row.sourcing_checklist ?? {}), [v.step]: v.done } }).eq('id', v.id))
    revalidatePath('/opportunities/[id]', 'page')
    return {}
  })
}

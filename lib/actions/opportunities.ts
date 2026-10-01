'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { run, log, must, check } from './core'
import { PIPELINE_STAGES } from '@/lib/db-types'
import { HttpError, type Session } from '@/lib/auth'

const uuid = z.string().uuid()
const stage = z.enum(PIPELINE_STAGES.map((s) => s.key) as [string, ...string[]])

async function coFor(s: Session, opportunityId: string): Promise<{ id: string; workflow_status: string; pipeline_stage: string | null; saved: boolean }> {
  const { data: opp } = await s.supabase.from('opportunities').select('id').eq('id', opportunityId).maybeSingle()
  if (!opp) throw new HttpError(404, 'Opportunity not found')
  const { data } = await s.supabase.from('company_opportunities').upsert({ company_id: s.companyId, opportunity_id: opportunityId }, { onConflict: 'company_id,opportunity_id', ignoreDuplicates: true }).select('id, workflow_status, pipeline_stage, saved')
  if (data?.[0]) return data[0]
  return must(await s.supabase.from('company_opportunities').select('id, workflow_status, pipeline_stage, saved').eq('company_id', s.companyId).eq('opportunity_id', opportunityId).single())
}

/** Internal workflow status — not a recommendation to bid. Returns the previous value so the UI can offer Undo. */
export async function setWorkflowStatus(input: unknown) {
  return run('member', z.object({ opportunityId: uuid, status: z.enum(['pursue', 'review', 'pass', 'none']) }), input, async (s, v) => {
    const co = await coFor(s, v.opportunityId)
    check(await s.supabase.from('company_opportunities').update({ workflow_status: v.status }).eq('id', co.id))
    await log(s, { entity: 'company_opportunity', id: co.id, opportunityId: v.opportunityId, action: 'workflow_status_changed', before: { workflow_status: co.workflow_status }, after: { workflow_status: v.status } })
    revalidatePath('/', 'layout')
    return { previous: co.workflow_status }
  })
}

export async function toggleSaved(input: unknown) {
  return run('member', z.object({ opportunityId: uuid, saved: z.boolean() }), input, async (s, v) => {
    const co = await coFor(s, v.opportunityId)
    check(await s.supabase.from('company_opportunities').update({ saved: v.saved }).eq('id', co.id))
    await log(s, { entity: 'company_opportunity', id: co.id, opportunityId: v.opportunityId, action: v.saved ? 'saved' : 'unsaved' })
    revalidatePath('/', 'layout')
    return { previous: co.saved }
  })
}

export async function addToPipeline(input: unknown) {
  return run('member', z.object({ opportunityIds: z.array(uuid).min(1).max(200) }), input, async (s, v) => {
    for (const id of v.opportunityIds) {
      const co = await coFor(s, id)
      if (co.pipeline_stage) continue
      check(await s.supabase.from('company_opportunities').update({ pipeline_stage: 'new', saved: true }).eq('id', co.id))
      await log(s, { entity: 'company_opportunity', id: co.id, opportunityId: id, action: 'added_to_pipeline', after: { stage: 'new' } })
    }
    revalidatePath('/', 'layout')
    return { count: v.opportunityIds.length }
  })
}

/**
 * Move a card between stages. Submitted requires a confirmation note (Fieldpoint never submits anything — the user
 * records that they submitted manually). Lost/Passed takes an optional reason. Won/Lost can record an award amount.
 */
export async function moveStage(input: unknown) {
  return run('member', z.object({ coId: uuid, stage, note: z.string().max(1000).optional(), awardAmount: z.number().nonnegative().optional() }), input, async (s, v) => {
    const { data: cur } = await s.supabase.from('company_opportunities').select('id, opportunity_id, pipeline_stage').eq('id', v.coId).maybeSingle()
    if (!cur) throw new HttpError(404, 'Not found')
    if (v.stage === 'submitted' && !v.note?.trim()) throw new HttpError(400, 'Add a note confirming you submitted this manually.')
    const patch: Record<string, unknown> = { pipeline_stage: v.stage }
    if (v.stage === 'submitted') patch.submitted_note = v.note
    if ((v.stage === 'lost_passed' || v.stage === 'won') && v.note !== undefined) patch.outcome_reason = v.note
    if (v.awardAmount !== undefined) patch.award_amount = v.awardAmount
    check(await s.supabase.from('company_opportunities').update(patch).eq('id', v.coId))
    await log(s, { entity: 'company_opportunity', id: v.coId, opportunityId: cur.opportunity_id, action: 'stage_moved', before: { stage: cur.pipeline_stage }, after: { stage: v.stage, note: v.note ?? null } })
    revalidatePath('/pipeline')
    return { previous: cur.pipeline_stage as string | null }
  })
}

/** Undo for stage moves (restores the previous stage without the Submitted-note rule when leaving Submitted). */
export async function restoreStage(input: unknown) {
  return run('member', z.object({ coId: uuid, stage: stage.nullable() }), input, async (s, v) => {
    if (v.stage === 'submitted') throw new HttpError(400, 'Re-enter the submission note to move back to Submitted.')
    check(await s.supabase.from('company_opportunities').update({ pipeline_stage: v.stage }).eq('id', v.coId))
    revalidatePath('/pipeline')
    return {}
  })
}

export async function markViewed(input: unknown) {
  return run('viewer', z.object({ opportunityId: uuid, hash: z.string().nullable() }), input, async (s, v) => {
    if (s.role === 'viewer') return {}
    const co = await coFor(s, v.opportunityId)
    await s.supabase.from('company_opportunities').update({ last_viewed_at: new Date().toISOString(), last_viewed_hash: v.hash }).eq('id', co.id)
    return {}
  })
}

export async function bulkAction(input: unknown) {
  return run('member', z.object({ opportunityIds: z.array(uuid).min(1).max(200), action: z.enum(['save', 'pass', 'pipeline']) }), input, async (s, v) => {
    for (const id of v.opportunityIds) {
      const co = await coFor(s, id)
      const patch = v.action === 'save' ? { saved: true } : v.action === 'pass' ? { workflow_status: 'pass' } : { pipeline_stage: co.pipeline_stage ?? 'new', saved: true }
      check(await s.supabase.from('company_opportunities').update(patch).eq('id', co.id))
    }
    await log(s, { entity: 'company_opportunity', action: `bulk_${v.action}`, after: { count: v.opportunityIds.length } })
    revalidatePath('/', 'layout')
    return { count: v.opportunityIds.length }
  })
}

/** Creates the company's workspace row for an opportunity (if needed) and seeds the checklist from the template. */
export async function startChecklist(input: unknown) {
  return run('member', z.object({ opportunityId: uuid }), input, async (s, v) => {
    const co = await coFor(s, v.opportunityId)
    const { data: tpl } = await s.supabase.from('checklist_templates').select('items').eq('company_id', s.companyId).maybeSingle()
    const items = (tpl?.items as Array<{ group: string; key: string; label: string }> | undefined) ?? (await import('@/lib/checklist')).DEFAULT_TEMPLATE
    check(await s.supabase.from('checklist_items').upsert(items.map((i) => ({ company_id: s.companyId, company_opportunity_id: co.id, group: i.group, key: i.key, label: i.label })), { onConflict: 'company_opportunity_id,key', ignoreDuplicates: true }))
    revalidatePath('/opportunities/[id]', 'page')
    return { coId: co.id }
  })
}

/** Workspace row for tabs that need one (notes, tasks, pricing, suppliers) before the user has saved/pursued anything. */
export async function ensureWorkspace(input: unknown) {
  return run('member', z.object({ opportunityId: uuid }), input, async (s, v) => {
    const co = await coFor(s, v.opportunityId)
    revalidatePath('/opportunities/[id]', 'page')
    return { coId: co.id }
  })
}

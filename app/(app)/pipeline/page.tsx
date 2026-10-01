import type { Metadata } from 'next'
import { Kanban, type KCard } from '@/components/app/Kanban'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Pipeline' }
export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const s = await requirePageSession()
  const { data } = await s.supabase.from('company_opportunities').select('id, opportunity_id, pipeline_stage, stage_entered_at, outcome_reason, award_amount, opp:opportunities(id, title, department, sub_tier, response_deadline, value_amount, color_label), checklist:checklist_items(status), sup:opportunity_suppliers(count)').not('pipeline_stage', 'is', null)
  const cards: KCard[] = (data ?? []).map((r: any) => {
    const c = { pass: 0, fail: 0, unknown: 0, na: 0 }
    for (const i of r.checklist ?? []) c[(i.status as string).toLowerCase() as 'pass'] = (c[(i.status as string).toLowerCase() as 'pass'] ?? 0) + 1
    return { coId: r.id, oppId: r.opportunity_id, stage: r.pipeline_stage, title: r.opp?.title ?? 'Unknown', agency: r.opp?.sub_tier ?? r.opp?.department ?? null, deadline: r.opp?.response_deadline ?? null, value: r.opp?.value_amount ?? null, checklist: r.checklist?.length ? c : null, supplier: s.role === 'viewer' ? 'Unknown' : (r.sup?.[0]?.count ?? 0) > 0 ? 'Found' : 'Needed' }
  })
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Drag a card, or use its Move menu. “Submitted” is always recorded by you — Fieldpoint never submits anything." />
      <Kanban initial={cards} canWrite={s.role !== 'viewer'} />
    </>
  )
}

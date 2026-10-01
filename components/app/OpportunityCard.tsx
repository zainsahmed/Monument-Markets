'use client'
import { FileText, History, Info, Package, Sparkles, Star, Ban, KanbanSquare, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { ColorPill, CountdownChip, LevelPill } from '@/components/ui/chips'
import { InfoPopover } from '@/components/ui/Popover'
import { classify } from '@/lib/classification'
import { daysLeft, orUnknown } from '@/lib/format'
import { NOTICE_LABELS } from '@/lib/sam/notice-types'
import type { OppRow } from '@/lib/data/opportunities'

export interface CardActions { onSave: (o: OppRow) => void; onPass: (o: OppRow) => void; onPipeline: (o: OppRow) => void; canWrite: boolean }

export const placeOf = (o: Pick<OppRow, 'pop_city' | 'pop_state' | 'pop_country'>) => [o.pop_city, o.pop_state].filter(Boolean).join(', ') || (o.pop_country ?? 'Unknown')

/** Rule that produced the colour label, shown in a popover (GREEN means "bid-type notice", not "we're eligible"). */
export function LabelRule({ o }: { o: OppRow }) {
  const c = classify({ noticeTypeCode: o.notice_type_code, active: o.active, cancelled: o.cancelled, responseDeadline: o.response_deadline })
  return <InfoPopover label="Why this label?"><strong>{c.label === 'GREEN' ? 'Potential bid' : c.label === 'YELLOW' ? 'Research / watch' : 'Awarded / not bid-ready'}</strong><p style={{ margin: '8px 0 0' }}>{c.rule}</p><p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '8px 0 0' }}>Labels come from fixed rules on notice type, status and deadline — not from AI.</p></InfoPopover>
}

function Fact({ icon, label, children, info }: { icon: React.ReactNode; label: string; children: React.ReactNode; info?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="t-footnote" style={{ color: 'var(--label-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>{icon}{label}{info}</div>
      <div className="t-callout" style={{ fontWeight: 500 }}>{children}</div>
    </div>
  )
}

/** Opportunity card (card view and inspector): spec §4.5. AI Fit / Complexity read "Unknown" until a Pursuit Brief exists. */
export function OpportunityCard({ o, actions, compact = false }: { o: OppRow; actions: CardActions; compact?: boolean }) {
  const d = daysLeft(o.response_deadline)
  const hasBrief = !!o.co?.ai_fit
  const fitInfo = (what: string) => <InfoPopover label={`About ${what}`}>{hasBrief ? <>AI judgement from this opportunity’s Pursuit Brief — labelled <strong>AI analysis</strong>. Open the AI Analysis tab for the rationale.</> : <>Unknown until a Pursuit Brief is generated. Run <strong>Analyze</strong> to get an AI-assisted view; it is never a recommendation to bid.</>}</InfoPopover>
  return (
    <article className="card" style={{ padding: 16, display: 'grid', gap: 12 }} aria-label={o.title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ColorPill label={o.color_label} /><LabelRule o={o} />
        <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{o.source === 'DIBBS' ? 'DIBBS' : 'SAM'} · {orUnknown(o.notice_type ?? NOTICE_LABELS[o.notice_type_code ?? ''])}</span>
        <span style={{ marginLeft: 'auto' }}><CountdownChip deadline={o.response_deadline} /></span>
      </div>
      <h3 className="t-headline" style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        <Link href={`/opportunities/${o.id}`} style={{ color: 'inherit' }}>{o.title}</Link>
      </h3>
      <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>{orUnknown(o.full_parent_path?.split('.').slice(0, 2).join(' › ') ?? o.department)}</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '8px 16px', margin: 0 }}>
        {[['Set-aside', o.set_aside ?? o.set_aside_code], ['NAICS', o.naics], ['PSC', o.psc], ['Location', placeOf(o) === 'Unknown' ? null : placeOf(o)]].map(([k, v]) => (
          <div key={k as string}><dt className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{k}</dt><dd className="t-callout num" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orUnknown(v as string | null)}</dd></div>
        ))}
      </dl>
      {!compact && <div className="hairline-t" style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '12px 16px' }}>
        <Fact icon={<Sparkles size={12} aria-hidden />} label="AI Fit" info={fitInfo('AI Fit')}><LevelPill level={o.co?.ai_fit} /></Fact>
        <Fact icon={<Info size={12} aria-hidden />} label="Complexity" info={fitInfo('Complexity')}><LevelPill level={o.co?.complexity} /></Fact>
        <Fact icon={<History size={12} aria-hidden />} label="Days left"><span className="num">{d === null ? 'Unknown' : d <= 0 ? 'Closed' : d}</span></Fact>
        <Fact icon={<Package size={12} aria-hidden />} label="Supplier"><span>{o.supplier}</span></Fact>
        <Fact icon={<FileText size={12} aria-hidden />} label="Documents"><span className="num">{o.docs}</span></Fact>
        <Fact icon={<History size={12} aria-hidden />} label="Similar awards"><span className="num">{o.similar}</span></Fact>
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href={`/opportunities/${o.id}`} className="btn btn-primary">View</Link>
        <Link href={`/opportunities/${o.id}?tab=ai&analyze=1`} className="btn btn-secondary"><Sparkles size={14} aria-hidden />Analyze</Link>
        {actions.canWrite && <>
          <Button onClick={() => actions.onSave(o)} aria-pressed={!!o.co?.saved}><Star size={14} fill={o.co?.saved ? 'currentColor' : 'none'} aria-hidden />{o.co?.saved ? 'Saved' : 'Save'}</Button>
          <Button onClick={() => actions.onPass(o)} aria-pressed={o.co?.workflow_status === 'pass'}><Ban size={14} aria-hidden />{o.co?.workflow_status === 'pass' ? 'Passed' : 'Pass'}</Button>
          <Button onClick={() => actions.onPipeline(o)} disabled={!!o.co?.pipeline_stage}><KanbanSquare size={14} aria-hidden />{o.co?.pipeline_stage ? 'In pipeline' : 'Add to pipeline'}</Button>
        </>}
        {o.ui_link && <a href={o.ui_link} target="_blank" rel="noreferrer noopener" className="btn btn-plain"><ExternalLink size={14} aria-hidden />SAM.gov</a>}
      </div>
    </article>
  )
}

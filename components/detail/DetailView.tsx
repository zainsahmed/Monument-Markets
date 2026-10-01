'use client'
import { ArrowUpRight, Check, Copy, ExternalLink, History } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ColorPill, CountdownChip } from '@/components/ui/chips'
import { InfoPopover } from '@/components/ui/Popover'
import { Seg } from '@/components/ui/Seg'
import { useToast } from '@/components/ui/Toast'
import { LabelRule } from '@/components/app/OpportunityCard'
import { useKeyAction } from '@/components/app/keys'
import { markViewed, setWorkflowStatus } from '@/lib/actions/opportunities'
import type { DetailData } from '@/lib/data/detail'
import { fmtDeadline, orUnknown } from '@/lib/format'
import type { OppRow } from '@/lib/data/opportunities'
import { OverviewTab } from './OverviewTab'
import { RequirementsTab } from './RequirementsTab'
import { DocumentsTab } from './DocumentsTab'
import { AiTab } from './AiTab'
import { HistoricalTab } from './HistoricalTab'
import { SuppliersTab } from './SuppliersTab'
import { PricingTab } from './PricingTab'
import { ChecklistTab } from './ChecklistTab'
import { NotesTab } from './NotesTab'
import { ActivityTab } from './ActivityTab'

export const TABS = [['overview', 'Overview'], ['requirements', 'Requirements'], ['documents', 'Documents'], ['ai', 'AI Analysis'], ['historical', 'Historical Awards'], ['suppliers', 'Suppliers'], ['pricing', 'Pricing'], ['checklist', 'Checklist'], ['notes', 'Notes'], ['activity', 'Activity']] as const
type TabKey = (typeof TABS)[number][0]

export function DetailView({ d, role, descriptionHtml, userId, minMargin }: { d: DetailData; role: string; descriptionHtml: string; userId: string; minMargin: number | null }) {
  const sp = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const { toast } = useToast()
  const tab = (TABS.find((t) => t[0] === sp.get('tab'))?.[0] ?? 'overview') as TabKey
  const [status, setStatus] = useState(d.co?.workflow_status ?? 'none')
  const [copied, setCopied] = useState(false)
  const [, start] = useTransition()
  const canWrite = role !== 'viewer'
  const o = d.opp
  const amended = !!d.co?.last_viewed_at && !!d.co.last_viewed_hash && d.co.last_viewed_hash !== o.content_hash

  useEffect(() => { if (canWrite) void markViewed({ opportunityId: o.id, hash: o.content_hash }) }, [o.id, o.content_hash, canWrite])
  const go = (t: string) => { const q = new URLSearchParams(sp.toString()); q.set('tab', t); if (t !== 'documents') { q.delete('doc'); q.delete('page'); q.delete('hl') } router.replace(`${path}?${q}`, { scroll: false }) }
  useKeyAction((k) => { if (!canWrite) return; if (k === 'a') go('ai'); if (k === 's') toast('Use the Save button on the list to bookmark.') })
  useEffect(() => { const h = () => go('ai'); window.addEventListener('fp:analyze', h); return () => window.removeEventListener('fp:analyze', h) })

  const setWf = (v: 'pursue' | 'review' | 'pass') => {
    const prev = status
    setStatus(v)
    start(async () => {
      const r = await setWorkflowStatus({ opportunityId: o.id, status: v })
      if (!r.ok) { setStatus(prev); toast(r.error, { error: true }) } else toast(`Marked ${v}`, { undo: () => { setStatus(prev); void setWorkflowStatus({ opportunityId: o.id, status: prev }) } })
    })
  }
  const docNames = useMemo(() => Object.fromEntries(d.docs.map((x) => [x.id, x.file_name])), [d.docs])
  const asRow = { ...o, co: d.co, docs: d.docs.length, similar: d.awards.length, supplier: d.attached.length ? 'Found' : 'Needed' } as unknown as OppRow
  const path2 = (o.full_parent_path ?? o.department ?? '').split('.').map((x) => x.trim()).filter(Boolean)

  return (
    <>
      <nav aria-label="Breadcrumb" className="t-footnote" style={{ color: 'var(--label-secondary)', marginBottom: 8 }}>
        <Link href="/opportunities?tab=all">Opportunities</Link>{path2.map((p) => <span key={p}> › {p}</span>)}
      </nav>
      <header style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ColorPill label={o.color_label} /><LabelRule o={asRow} />
          <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{o.source === 'DIBBS' ? 'DIBBS RFQ (imported)' : 'SAM.gov'} · {orUnknown(o.notice_type)}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{fmtDeadline(o.response_deadline, o.response_deadline_raw)}</span><CountdownChip deadline={o.response_deadline} />
          </span>
        </div>
        <h1 className="t-title1" style={{ margin: 0, textWrap: 'balance' }}>{o.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {o.solicitation_number ? <span className="mono t-callout" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{o.solicitation_number}<button type="button" className="btn btn-icon btn-sm" style={{ width: 24, height: 24, padding: 0 }} aria-label="Copy solicitation number" onClick={() => { void navigator.clipboard?.writeText(o.solicitation_number!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}</button></span> : <span className="t-callout" style={{ color: 'var(--label-secondary)' }}>Solicitation number: Unknown</span>}
          {o.ui_link && <a href={o.ui_link} target="_blank" rel="noreferrer noopener" className="t-callout" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>View on SAM.gov <ExternalLink size={13} aria-hidden /></a>}
        </div>
        {canWrite && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Seg label="Workflow status" value={(status === 'none' ? 'review' : status) as 'pursue' | 'review' | 'pass'} onChange={setWf} options={[{ value: 'pursue', label: 'Pursue' }, { value: 'review', label: 'Review' }, { value: 'pass', label: 'Pass' }]} />
            <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>Internal workflow status — not a recommendation to bid.</span>
          </div>
        )}
        {amended && (
          <div role="status" className="card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', background: 'var(--yellow-fill)', color: 'var(--yellow)' }}>
            <History size={16} aria-hidden /><strong>This notice changed since you last viewed it.</strong>
            <button type="button" className="btn btn-plain btn-sm" style={{ color: 'var(--yellow)', textDecoration: 'underline' }} onClick={() => go('activity')}>See what changed <ArrowUpRight size={12} aria-hidden /></button>
          </div>
        )}
      </header>

      <div role="tablist" aria-label="Opportunity sections" className="hairline-b" style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20, scrollbarWidth: 'none' }}
        onKeyDown={(e) => { const i = TABS.findIndex((t) => t[0] === tab); if (e.key === 'ArrowRight') go(TABS[(i + 1) % TABS.length][0]); if (e.key === 'ArrowLeft') go(TABS[(i - 1 + TABS.length) % TABS.length][0]) }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => go(k)}
            style={{ flex: 'none', height: 40, padding: '0 12px', background: 'none', border: 0, borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, color: tab === k ? 'var(--label-primary)' : 'var(--label-secondary)', fontWeight: 500, fontSize: 'var(--t-callout-size)', whiteSpace: 'nowrap' }}>{label}</button>
        ))}
      </div>
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} style={{ outline: 'none' }}>
        {tab === 'overview' && <OverviewTab d={d} descriptionHtml={descriptionHtml} canWrite={canWrite} />}
        {tab === 'requirements' && <RequirementsTab d={d} docNames={docNames} goTab={go} />}
        {tab === 'documents' && <DocumentsTab d={d} canWrite={canWrite} />}
        {tab === 'ai' && <AiTab d={d} docNames={docNames} canWrite={canWrite} />}
        {tab === 'historical' && <HistoricalTab d={d} canWrite={canWrite} />}
        {tab === 'suppliers' && <SuppliersTab d={d} role={role} />}
        {tab === 'pricing' && <PricingTab d={d} role={role} minMargin={minMargin} />}
        {tab === 'checklist' && <ChecklistTab key={d.checklist.map((i) => `${i.id}:${i.status}:${i.ai_suggestion?.status ?? ''}`).join('|')} d={d} canWrite={canWrite} docNames={docNames} />}
        {tab === 'notes' && <NotesTab d={d} canWrite={canWrite} userId={userId} />}
        {tab === 'activity' && <ActivityTab d={d} />}
      </section>
    </>
  )
}
export { InfoPopover }

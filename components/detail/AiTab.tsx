'use client'
import { AlertTriangle, ListChecks, Sparkles } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, InfoNote, LabelChip, LevelPill } from '@/components/ui/chips'
import { Sheet } from '@/components/ui/Dialog'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { DEFENSE_FLAG_LABELS } from '@/lib/ai/schemas'
import type { DetailData } from '@/lib/data/detail'
import { timeAgo } from '@/lib/format'
import { StatementView, type DocNames } from './Statement'

const PROVIDE: Record<string, string> = { product_service: 'Product / service', quantity: 'Quantity', location: 'Location', delivery_performance: 'Delivery / performance', personnel_equipment: 'Personnel & equipment' }
const DATES: Record<string, string> = { posted: 'Posted', questions_due: 'Questions due', offers_due: 'Offers due', period_of_performance: 'Period of performance', other: 'Other' }
const CONTRACT: Record<string, string> = { agency: 'Agency', notice_type: 'Notice type', naics: 'NAICS', psc: 'PSC', set_aside: 'Set-aside', place_of_performance: 'Place of performance', contract_type: 'Contract type', estimated_value: 'Estimated value' }
const REQ: Record<string, string> = { certifications: 'Certifications', licenses: 'Licenses', past_performance: 'Past performance', security_clearance: 'Security clearance', approved_source: 'Approved source / manufacturer', domestic_sourcing: 'Domestic sourcing', delivery: 'Delivery', insurance_bonding: 'Insurance & bonding', technical: 'Technical', other: 'Other' }
const FLAG_TONE = { REQUIRED: 'red', NOT_MENTIONED: 'gray', UNCLEAR: 'yellow' } as const
const FLAG_TEXT = { REQUIRED: 'Required', NOT_MENTIONED: 'Not mentioned', UNCLEAR: 'Unclear' } as const

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section className="card" style={{ padding: 16 }} aria-label={title}><h2 className="t-headline" style={{ margin: '0 0 12px' }}><span style={{ color: 'var(--label-tertiary)', marginRight: 8 }} className="num">{n}</span>{title}</h2><div style={{ display: 'grid', gap: 12 }}>{children}</div></section>
}

export function AiTab({ d, docNames, canWrite }: { d: DetailData; docNames: DocNames; canWrite: boolean }) {
  const router = useRouter()
  const sp = useSearchParams()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState<'brief' | 'extract' | null>(null)
  const [busy, setBusy] = useState<'brief' | 'extract' | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (sp.get('analyze') === '1' && canWrite && !d.brief) setConfirm('brief') }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const over = d.aiSpend.spent >= d.aiSpend.cap
  const b = d.brief?.output.brief
  const stats = d.brief?.output.citation_stats

  async function run(kind: 'brief' | 'extract') {
    setConfirm(null); setBusy(kind); setError(null)
    try {
      const r = await fetch(`/api/opportunities/${d.opp.id}/${kind === 'brief' ? 'analyze' : 'extract'}`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setError(j.error ?? 'The analysis failed. Nothing was saved.')
      else { toast(`Done · $${Number(j.costUsd).toFixed(2)} · ${j.citationRejections} of ${j.citationTotal} citations rejected`); const q = new URLSearchParams(sp.toString()); q.delete('analyze'); router.replace(`?${q}`, { scroll: false }); router.refresh() }
    } catch { setError('Could not reach the server.') }
    setBusy(null)
  }
  const docCount = d.docs.filter((x) => x.parse_status === 'parsed').length

  const actions = canWrite && (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="primary" disabled={busy !== null || over} onClick={() => setConfirm('brief')}><Sparkles size={14} aria-hidden />{busy === 'brief' ? 'Analyzing…' : b ? 'Regenerate brief' : 'Analyze'}</Button>
      <Button disabled={busy !== null || over || docCount === 0} onClick={() => setConfirm('extract')}><ListChecks size={14} aria-hidden />{busy === 'extract' ? 'Extracting…' : 'Extract requirements'}</Button>
      <span className="t-footnote" style={{ color: over ? 'var(--red)' : 'var(--label-secondary)' }}>AI spend this month ${d.aiSpend.spent.toFixed(2)} of ${d.aiSpend.cap.toFixed(2)}{over ? ' — cap reached; raise it in Settings' : ''}</span>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {actions}
      {busy && <p role="status" className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Sparkles size={16} className="spin" aria-hidden />Reading the notice and {docCount} document{docCount === 1 ? '' : 's'}. This can take a few minutes — you can keep working.</p>}
      {error && <p role="alert" className="card t-callout" style={{ padding: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
      {d.failedAnalysis && !error && <p role="alert" className="card t-callout" style={{ padding: 12, margin: 0, color: 'var(--red)' }}>The last attempt ({timeAgo(d.failedAnalysis.created_at)}) failed: {d.failedAnalysis.error}</p>}
      {d.briefStale && <div role="status" className="card" style={{ padding: 12, background: 'var(--yellow-fill)', color: 'var(--yellow)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><AlertTriangle size={16} aria-hidden /><span><strong>The notice or its documents changed after this brief was written.</strong> Fieldpoint won’t spend on a new analysis without your say-so.</span>{canWrite && <Button small onClick={() => setConfirm('brief')} disabled={over}>Regenerate</Button>}</div>}
      {!b ? <Empty icon={Sparkles} title="No Pursuit Brief yet" body="Fieldpoint reads the stored notice and any parsed documents and writes a cited brief. Every statement is labelled Verified, AI analysis or Needs verification." /> : (
        <>
          <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>Generated {timeAgo(d.brief!.created_at)} · {d.brief!.model} · ${Number(d.brief!.cost_usd).toFixed(2)} · {stats?.total ?? 0} citations checked, {stats?.rejected ?? 0} rejected{stats?.downgraded ? `, ${stats.downgraded} downgraded to “Needs verification”` : ''}</p>
          {(d.brief!.output.unparsed_documents?.length ?? 0) > 0 && <p role="note" className="t-callout card" style={{ padding: 12, margin: 0, color: 'var(--yellow)', background: 'var(--yellow-fill)' }}>Not analyzed (no extractable text — OCR needed): {d.brief!.output.unparsed_documents.join(', ')}</p>}
          <Section n={1} title="What they want">{b.what_they_want.map((s, i) => <StatementView key={i} {...s} docNames={docNames} />)}</Section>
          <Section n={2} title="What we’d have to provide">{b.what_we_provide.length ? b.what_we_provide.map((s, i) => <StatementView key={i} {...s} docNames={docNames} prefix={<strong>{PROVIDE[s.category]}: </strong>} />) : <p className="t-callout" style={{ margin: 0 }}>Unknown</p>}</Section>
          <Section n={3} title="Key dates">{b.key_dates.length ? b.key_dates.map((s, i) => <StatementView key={i} {...s} docNames={docNames} prefix={<strong>{DATES[s.kind]}: {s.value} — </strong>} />) : <p className="t-callout" style={{ margin: 0 }}>Unknown</p>}</Section>
          <Section n={4} title="Contract details">{b.contract_details.map((s, i) => <StatementView key={i} {...s} docNames={docNames} prefix={<strong>{CONTRACT[s.field]}: {s.value} — </strong>} />)}</Section>
          <Section n={5} title="Requirements">{b.requirements.length ? b.requirements.map((s, i) => <StatementView key={i} {...s} docNames={docNames} prefix={<strong>{REQ[s.category]}: </strong>} />) : <p className="t-callout" style={{ margin: 0 }}>None identified in the available text.</p>}</Section>
          <Section n={6} title="Defense flags">
            <div style={{ display: 'grid', gap: 8 }}>{b.defense_flags.map((f) => (
              <div key={f.flag} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) auto 1fr', gap: 12, alignItems: 'start' }}>
                <strong className="t-callout">{DEFENSE_FLAG_LABELS[f.flag]}</strong><Badge tone={FLAG_TONE[f.status]}>{FLAG_TEXT[f.status]}</Badge>
                <StatementView {...f} docNames={docNames} />
              </div>))}</div>
          </Section>
          <Section n={7} title="Potential problems">{b.potential_problems.length ? b.potential_problems.map((s, i) => <StatementView key={i} {...s} docNames={docNames} />) : <p className="t-callout" style={{ margin: 0 }}>None identified from the available text.</p>}</Section>
          <Section n={8} title="Missing information">{b.missing_information.length ? b.missing_information.map((s, i) => <StatementView key={i} {...s} docNames={docNames} />) : <p className="t-callout" style={{ margin: 0 }}>None identified.</p>}</Section>
          <Section n={9} title="Next steps">{b.next_steps.map((s, i) => <StatementView key={i} {...s} docNames={docNames} />)}</Section>
          <Section n={10} title="AI Fit and Complexity">
            <div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>AI Fit</strong><LevelPill level={b.fit.ai_fit} /><LabelChip label="ANALYSIS" /></div><p className="t-body" style={{ margin: '8px 0 0' }}>{b.fit.fit_rationale.text}</p></div>
            <div><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>Complexity</strong><LevelPill level={b.fit.complexity} /><LabelChip label="ANALYSIS" /></div><p className="t-body" style={{ margin: '8px 0 0' }}>{b.fit.complexity_rationale.text}</p></div>
            <InfoNote>Fit and complexity are judgements, not a recommendation to bid and not a score. You decide.</InfoNote>
          </Section>
        </>
      )}
      <Sheet open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} title={confirm === 'extract' ? 'Extract requirements' : 'Analyze this opportunity'} description="This sends the stored notice, parsed document text and your company profile to Claude. It spends from your monthly AI budget." width={460}>
        <ul className="t-callout" style={{ margin: '0 0 16px', paddingLeft: 18, color: 'var(--label-secondary)' }}>
          <li>{docCount} parsed document{docCount === 1 ? '' : 's'} + the notice record will be read.</li>
          <li>Supplier, quote and pricing data are <strong>not</strong> sent.</li>
          <li>Month to date: ${d.aiSpend.spent.toFixed(2)} of ${d.aiSpend.cap.toFixed(2)}. Cost depends on document length and is shown when it finishes.</li>
          <li>Every citation is machine-checked; unsupported claims are downgraded.</li>
        </ul>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="plain" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={() => run(confirm === 'extract' ? 'extract' : 'brief')}>Run analysis</Button></div>
      </Sheet>
    </div>
  )
}

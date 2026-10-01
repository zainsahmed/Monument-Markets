'use client'
import { Calculator, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, InfoNote } from '@/components/ui/chips'
import { InfoPopover } from '@/components/ui/Popover'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { savePricing } from '@/lib/actions/work'
import type { DetailData } from '@/lib/data/detail'
import { fmtMoney, fmtDate } from '@/lib/format'
import { COST_FIELDS, FIELD_LABELS, computePricing, type PricingLine } from '@/lib/pricing'
import { HISTORICAL_DISCLAIMER, summarizeAwards } from '@/lib/usaspending'
import { useCo } from './useCo'

type Draft = { clin: string; description: string; vals: Record<(typeof COST_FIELDS)[number], string>; quote_id: string }
const blank = (): Draft => ({ clin: '', description: '', vals: Object.fromEntries(COST_FIELDS.map((f) => [f, ''])) as Draft['vals'], quote_id: '' })
const num = (s: string): number | null => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))
const fromRow = (r: Record<string, any>): Draft => ({ clin: r.clin ?? '', description: r.description ?? '', vals: Object.fromEntries(COST_FIELDS.map((f) => [f, r[f] === null || r[f] === undefined ? '' : String(r[f])])) as Draft['vals'], quote_id: r.quote_id ?? '' })

export function PricingTab({ d, role, minMargin }: { d: DetailData; role: string; minMargin: number | null }) {
  const latest = d.pricing[0]
  const [lines, setLines] = useState<Draft[]>(latest?.lines?.length ? [...latest.lines].sort((a, b) => a.position - b.position).map(fromRow) : [blank()])
  const [margin, setMargin] = useState(latest?.desired_margin != null ? String(latest.desired_margin * 100) : '')
  const [target, setTarget] = useState(latest?.target_price != null ? String(latest.target_price) : '')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const getCo = useCo(d)

  const priced: PricingLine[] = useMemo(() => lines.map((l) => ({ clin: l.clin || null, description: l.description || null, quote_id: l.quote_id || null, ...(Object.fromEntries(COST_FIELDS.map((f) => [f, num(l.vals[f])])) as Record<(typeof COST_FIELDS)[number], number | null>) })), [lines])
  const res = useMemo(() => computePricing({ lines: priced, desiredMargin: num(margin) === null ? null : (num(margin) as number) / 100, targetPrice: num(target), minMargin }), [priced, margin, target, minMargin])
  const hist = summarizeAwards(d.awards)

  if (role === 'viewer') return <Empty icon={Calculator} title="Pricing isn’t available to viewers" />
  const setVal = (i: number, f: keyof Draft['vals'], v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, vals: { ...l.vals, [f]: v.replace(/[^\d.]/g, '') } } : l)))
  const save = async () => {
    const coId = await getCo(); if (!coId) return toast('Could not create a workspace for this notice', { error: true })
    setBusy(true)
    const r = await savePricing({ coId, label: label || undefined, desiredMargin: num(margin) === null ? null : (num(margin) as number) / 100, targetPrice: num(target), isEstimated: res.estimated, lines: priced.map((l) => ({ clin: l.clin ?? null, description: l.description ?? null, unit_cost: l.unit_cost, quantity: l.quantity, shipping: l.shipping, labor: l.labor, subcontractors: l.subcontractors, travel: l.travel, insurance: l.insurance, other: l.other, quote_id: l.quote_id ?? null })) })
    setBusy(false)
    if (!r.ok) return toast(r.error, { error: true })
    toast(`Saved as version ${r.data.version}`); setLabel(''); router.refresh()
  }
  const unitInputs: Array<(typeof COST_FIELDS)[number]> = [...COST_FIELDS]
  const money = (n: number | null) => (n === null ? '—' : fmtMoney(n, { exact: true }))
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 className="t-headline" style={{ margin: 0 }}>Pricing calculator</h2>
        <InfoPopover label="Pricing formulas" width={380}>
          <strong>Formulas</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="t-callout"><li>Line cost = unit cost × quantity + shipping + labor + subcontractors + travel + insurance + other</li><li>Total cost = Σ line costs</li><li>Price at desired margin = total cost ÷ (1 − margin)</li><li>Gross profit = revenue − total cost</li><li>Gross margin = gross profit ÷ revenue</li></ul>
          <p style={{ margin: '8px 0 0' }}>Enter a target price instead to solve for the margin. Blank inputs are never treated as zero.</p>
        </InfoPopover>
        {res.state === 'computed' && res.estimated && <Badge tone="yellow">Estimated</Badge>}
        {res.state === 'computed' && !res.estimated && <Badge tone="green">All inputs entered &amp; quoted</Badge>}
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="fp-table" style={{ minWidth: 1100 }}>
          <thead><tr><th scope="col">CLIN</th><th scope="col">Description</th>{unitInputs.map((f) => <th key={f} scope="col">{FIELD_LABELS[f]}</th>)}<th scope="col">Quote</th><th scope="col">Line cost</th><th /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i} style={{ height: 'auto' }}>
              <td style={{ width: 70 }}><input className="input" aria-label={`Line ${i + 1} CLIN`} value={l.clin} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, clin: e.target.value } : x)))} /></td>
              <td style={{ width: 180 }}><input className="input" aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></td>
              {unitInputs.map((f) => <td key={f} style={{ width: 96 }}><input className="input num" inputMode="decimal" aria-label={`Line ${i + 1} ${FIELD_LABELS[f]}`} placeholder="—" value={l.vals[f]} onChange={(e) => setVal(i, f, e.target.value)} /></td>)}
              <td style={{ width: 150 }}><select className="select" aria-label={`Line ${i + 1} backing quote`} value={l.quote_id} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quote_id: e.target.value } : x)))}><option value="">No quote</option>{d.quotes.map((q) => <option key={q.id} value={q.id}>{fmtMoney(q.amount)} · {fmtDate(q.quote_date)}</option>)}</select></td>
              <td className="num" style={{ width: 110 }}>{money(res.lineCosts[i] ?? null)}</td>
              <td style={{ width: 40 }}>{lines.length > 1 && <button type="button" className="btn btn-icon btn-sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden /></button>}</td>
            </tr>))}</tbody>
        </table>
        <div style={{ padding: 8 }}><Button small onClick={() => setLines((l) => [...l, blank()])}><Plus size={14} aria-hidden />Add CLIN line</Button></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
        <section className="card" style={{ padding: 16, display: 'grid', gap: 12 }} aria-label="Margin and target">
          <div><label className="field-label" htmlFor="m">Desired gross margin (%)</label><input id="m" className="input num" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 20" /></div>
          <div><label className="field-label" htmlFor="t">Target price ($) — solve for margin</label><input id="t" className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} placeholder="optional" /></div>
          {minMargin !== null && <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>Your profile’s minimum gross margin: {(minMargin * 100).toFixed(1)}%</p>}
        </section>
        <section className="card" style={{ padding: 16 }} aria-label="Result" aria-live="polite">
          {res.state === 'none' ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>Enter at least one cost to see a result. Fieldpoint won’t show profitability with no costs entered.</p> : (
            <>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 16px', margin: 0 }} className="t-body">
                <dt>Total cost</dt><dd className="num" style={{ margin: 0 }}>{money(res.totalCost)}</dd>
                <dt>Price at desired margin</dt><dd className="num" style={{ margin: 0 }}>{money(res.priceAtDesiredMargin)}</dd>
                <dt>Revenue used {res.revenueSource === 'target' && <span className="t-footnote">(target price)</span>}</dt><dd className="num" style={{ margin: 0 }}>{money(res.revenue)}</dd>
                <dt>Gross profit</dt><dd className="num" style={{ margin: 0 }}>{money(res.grossProfit)}</dd>
                <dt>Gross margin</dt><dd className="num t-headline" style={{ margin: 0 }}>{res.grossMargin === null ? '—' : `${(res.grossMargin * 100).toFixed(1)}%`}</dd>
              </dl>
              {res.marginWarning && <p role="alert" className="t-callout" style={{ color: 'var(--red)', margin: '12px 0 0' }}>⚠ {res.marginWarning}</p>}
              {res.errors.map((e) => <p key={e} role="alert" className="t-callout" style={{ color: 'var(--red)', margin: '8px 0 0' }}>{e}</p>)}
              {res.estimated && (
                <details style={{ marginTop: 12 }} open><summary className="t-subheadline" style={{ cursor: 'pointer' }}>Why “Estimated”? {res.missing.length} item{res.missing.length === 1 ? '' : 's'} missing or unquoted</summary>
                  <ul className="t-footnote" style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--label-secondary)', maxHeight: 160, overflow: 'auto' }}>{res.missing.map((m, i) => <li key={i}>{m.message}</li>)}</ul></details>
              )}
            </>
          )}
        </section>
      </div>

      <section className="card" style={{ padding: 16 }} aria-label="Historical context">
        <h3 className="t-subheadline" style={{ margin: '0 0 4px' }}>Historical award range (context only)</h3>
        <p className="t-callout num" style={{ margin: 0 }}>{hist.min === null ? 'No historical awards loaded — see the Historical Awards tab.' : `${fmtMoney(hist.min, { compact: true })} – ${fmtMoney(hist.max, { compact: true })} · median ${fmtMoney(hist.median, { compact: true })} · ${hist.count} awards`}</p>
        <div style={{ marginTop: 8 }}><InfoNote>{HISTORICAL_DISCLAIMER}</InfoNote></div>
      </section>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ width: 240 }} aria-label="Scenario name" placeholder="Scenario name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button variant="primary" disabled={busy} onClick={save}>Save as new version</Button>
        <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{d.pricing.length ? `${d.pricing.length} saved version${d.pricing.length > 1 ? 's' : ''}` : 'Not saved yet'}</span>
      </div>
      {d.pricing.length > 0 && (
        <section className="card" style={{ padding: 16 }} aria-label="Saved versions">
          <h3 className="t-subheadline" style={{ margin: '0 0 8px' }}>Saved versions</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{d.pricing.map((p) => (
            <li key={p.id} className="hairline-b" style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
              <strong className="t-callout num">v{p.version}</strong><span className="t-callout" style={{ flex: 1 }}>{p.label ?? 'Untitled'} · {new Date(p.created_at).toLocaleDateString()}{p.is_estimated && <> · <Badge tone="yellow">Estimated</Badge></>}</span>
              <Button small onClick={() => { setLines(p.lines?.length ? [...p.lines].sort((a, b) => a.position - b.position).map(fromRow) : [blank()]); setMargin(p.desired_margin != null ? String(p.desired_margin * 100) : ''); setTarget(p.target_price != null ? String(p.target_price) : ''); toast(`Loaded version ${p.version} into the editor`) }}>Load</Button>
            </li>))}</ul>
        </section>
      )}
    </div>
  )
}

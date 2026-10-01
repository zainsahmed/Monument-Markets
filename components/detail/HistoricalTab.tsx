'use client'
import { History, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InfoNote } from '@/components/ui/chips'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, fmtMoney, orUnknown, timeAgo } from '@/lib/format'
import { HISTORICAL_DISCLAIMER, summarizeAwards } from '@/lib/usaspending'
import type { DetailData } from '@/lib/data/detail'

const STRATEGY: Record<string, string> = { naics_psc: 'NAICS + PSC', naics_agency: 'NAICS + agency', keyword: 'Keywords' }

export function HistoricalTab({ d, canWrite }: { d: DetailData; canWrite: boolean }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const sum = summarizeAwards(d.awards)
  async function run(force: boolean) {
    setBusy(true)
    const r = await fetch(`/api/opportunities/${d.opp.id}/historical`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ force }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return toast(j.error ?? 'Lookup failed', { error: true })
    toast(j.cached ? 'Showing cached results (under 7 days old)' : `Found ${j.count} historical awards`)
    router.refresh()
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p role="note" className="card t-callout" style={{ margin: 0, padding: 12, background: 'var(--yellow-fill)', color: 'var(--yellow)', fontWeight: 500 }}>{HISTORICAL_DISCLAIMER}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {canWrite && <Button variant="primary" disabled={busy} onClick={() => run(!!d.lookup)}><RefreshCw size={14} className={busy ? 'spin' : ''} aria-hidden />{d.lookup ? 'Refresh from USAspending' : 'Look up on USAspending'}</Button>}
        {d.lookup && <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>Fetched {timeAgo(d.lookup.fetched_at)} · cached for 7 days · matched via {d.lookup.strategies.map((s) => `${STRATEGY[s.name] ?? s.name} (${s.error ? 'failed' : s.count})`).join(', ')}</span>}
      </div>
      {!d.lookup && d.awards.length === 0 ? <Empty icon={History} title="No historical awards yet" body="Look up what the government bought before under similar NAICS, PSC, agency and keywords (last five fiscal years)." /> : (
        <>
          <dl className="card" style={{ margin: 0, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            {[['Awards found', String(sum.count)], ['Median', fmtMoney(sum.median)], ['Range', sum.min === null ? 'Unknown' : `${fmtMoney(sum.min, { compact: true })} – ${fmtMoney(sum.max, { compact: true })}`]].map(([k, v]) => <div key={k}><dt className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{k}</dt><dd className="t-title3 num" style={{ margin: 0 }}>{v}</dd></div>)}
            {sum.count > sum.withAmount && <div className="t-footnote" style={{ color: 'var(--label-secondary)', alignSelf: 'end' }}>{sum.count - sum.withAmount} with unknown amount excluded from the median</div>}
          </dl>
          <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>“Amount” is the award’s total obligated value, which can span many deliveries — it is not a unit price.</p>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="fp-table" style={{ minWidth: 1000 }}>
              <thead><tr>{['Awardee', 'Agency', 'Award date', 'Amount', 'Contract type', 'NAICS', 'PSC', 'Set-aside', 'Place', 'Matched by', ''].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
              <tbody>{d.awards.map((a) => (
                <tr key={a.id}><td style={{ maxWidth: 220 }} title={a.recipient ?? ''}>{orUnknown(a.recipient)}</td><td>{orUnknown(a.sub_agency ?? a.agency)}</td><td className="num">{fmtDate(a.award_date)}</td><td className="num">{fmtMoney(a.amount)}</td><td>{orUnknown(a.contract_type)}</td><td className="num">{orUnknown(a.naics)}</td><td className="num">{orUnknown(a.psc)}</td><td>{orUnknown(a.set_aside)}</td><td>{orUnknown(a.pop)}</td><td>{a.matched_by.map((m) => STRATEGY[m] ?? m).join(', ')}</td><td>{a.usaspending_url && <a href={a.usaspending_url} target="_blank" rel="noreferrer noopener">USAspending</a>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <InfoNote>{HISTORICAL_DISCLAIMER}</InfoNote>
    </div>
  )
}

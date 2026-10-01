'use client'
import { FileInput, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ColorPill } from '@/components/ui/chips'
import { orUnknown } from '@/lib/format'
import type { DibbsRfq } from '@/lib/dibbs/parse'

export function DibbsImport({ canWrite }: { canWrite: boolean }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<{ opportunityId: string; parsed: DibbsRfq; label: 'GREEN' | 'YELLOW' | 'RED'; updated: boolean } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  async function send(body: BodyInit, headers?: Record<string, string>) {
    setBusy(true); setErr(null); setRes(null)
    const r = await fetch('/api/import/dibbs', { method: 'POST', body, headers })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return setErr(j.error ?? 'Import failed')
    setRes(j)
  }
  if (!canWrite) return <p className="t-callout">Viewers can’t import.</p>
  const p = res?.parsed
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
      <section className="card" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <h2 className="t-headline" style={{ margin: 0 }}>Upload an RFQ</h2>
        <input ref={file} type="file" hidden accept=".pdf,.txt,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append('file', f); void send(fd) } e.target.value = '' }} />
        <Button disabled={busy} onClick={() => file.current?.click()}><Upload size={14} aria-hidden />Choose PDF or text file</Button>
        <h2 className="t-headline" style={{ margin: '8px 0 0' }}>…or paste RFQ text</h2>
        <textarea className="textarea mono" rows={12} aria-label="RFQ text" placeholder={'RFQ NO: SPE7M1-26-T-0412\nNSN/PART: 4320-01-234-5678\nQTY: 40  UI: EA\nDELIVERY: 90 DAYS ARO\nRETURN BY: 10-15-2026 …'} value={text} onChange={(e) => setText(e.target.value)} />
        <div><Button variant="primary" disabled={busy || text.trim().length < 20} onClick={() => send(JSON.stringify({ text }), { 'content-type': 'application/json' })}>{busy ? 'Importing…' : 'Import pasted text'}</Button></div>
        {err && <p role="alert" className="t-callout" style={{ color: 'var(--red)', margin: 0 }}>{err}</p>}
      </section>
      <section className="card" style={{ padding: 16 }} aria-label="Import result" aria-live="polite">
        {!p ? <div style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: '48px 0' }}><FileInput size={40} strokeWidth={1.25} aria-hidden /><p className="t-callout">Parsed fields appear here. Anything not found is shown as “Unknown” — never guessed.</p></div> : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 className="t-headline" style={{ margin: 0, flex: 1 }}>{res!.updated ? 'Updated' : 'Imported'} {p.rfq_number ?? 'RFQ'}</h2><ColorPill label={res!.label} /></div>
            <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 12px', margin: '12px 0' }} className="t-callout">
              {([['NSN', p.nsn], ['Part number', p.part_number], ['Nomenclature', p.nomenclature], ['Quantity', p.quantity], ['Unit of issue', p.unit_of_issue], ['Delivery days', p.delivery_days], ['Required delivery', p.required_delivery_date], ['Approved sources', p.approved_sources.map((s) => `${s.cage}${s.part_number ? ` (${s.part_number})` : ''}`).join(', ') || null], ['Packaging', p.packaging], ['FOB', p.fob], ['Set-aside', p.set_aside], ['Close date', p.close_date]] as const).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt style={{ color: 'var(--label-secondary)' }}>{k}</dt><dd className="num" style={{ margin: 0, color: v === null ? 'var(--label-secondary)' : undefined }}>{orUnknown(v as string | number | null)}</dd></div>)}
            </dl>
            <Link className="btn btn-primary" href={`/opportunities/${res!.opportunityId}`}>Open opportunity</Link>
          </>
        )}
      </section>
    </div>
  )
}

'use client'
import { AlertTriangle, Plus, Truck, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { addQuote, attachSupplier, detachSupplier, setSourcingStep } from '@/lib/actions/suppliers'
import { SOURCING_STEPS } from '@/lib/schemas'
import type { DetailData } from '@/lib/data/detail'
import { fmtDate, fmtMoney, orUnknown } from '@/lib/format'
import { quoteExpiryWarnings } from '@/lib/pricing'
import { useCo } from './useCo'

export function SuppliersTab({ d, role }: { d: DetailData; role: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const getCo = useCo(d)
  const [pick, setPick] = useState('')
  const [q, setQ] = useState({ supplierId: '', amount: '', date: new Date().toISOString().slice(0, 10), until: '' })
  if (role === 'viewer') return <Empty icon={Truck} title="Supplier data isn’t available to viewers" body="Ask an owner to change your role if you need sourcing and pricing access." />
  const expiring = quoteExpiryWarnings(d.quotes.map((x) => ({ id: x.id, valid_until: x.valid_until })), d.opp.response_deadline)
  const names = new Map(d.suppliers.map((s) => [s.id, s.name]))
  const unattached = d.suppliers.filter((s) => !d.attached.some((a) => a.supplier_id === s.id))
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {expiring.length > 0 && <div role="alert" className="card" style={{ padding: 12, background: 'var(--yellow-fill)', color: 'var(--yellow)', display: 'flex', gap: 8 }}><AlertTriangle size={16} aria-hidden style={{ flex: 'none', marginTop: 2 }} /><span><strong>{expiring.length} quote{expiring.length > 1 ? 's expire' : ' expires'} before the offer deadline</strong> ({fmtDate(d.opp.response_deadline)}). Request refreshed quotes before relying on these prices.</span></div>}
      <section className="card" style={{ padding: 16 }} aria-label="Attached suppliers">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 className="t-headline" style={{ margin: 0, flex: 1 }}>Suppliers for this opportunity</h2>
          <select className="select" aria-label="Attach supplier" style={{ width: 220 }} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Attach a supplier…</option>{unattached.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <Button variant="primary" disabled={!pick} onClick={async () => { const coId = await getCo(); if (!coId) return; const r = await attachSupplier({ coId, supplierId: pick }); if (!r.ok) toast(r.error, { error: true }); else { setPick(''); router.refresh() } }}><Plus size={14} aria-hidden />Attach</Button>
          <Link className="btn btn-secondary" href="/suppliers?new=1">New supplier</Link>
        </div>
        {d.attached.length === 0 ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>No supplier attached. Sourcing status for this opportunity: <strong>Needed</strong>.</p> : d.attached.map((a) => (
          <article key={a.id} className="hairline-t" style={{ padding: '12px 0', display: 'grid', gap: 8 }}>
            <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Link href={`/suppliers/${a.supplier_id}`} className="t-callout" style={{ fontWeight: 600 }}>{a.supplier.name}</Link><span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{orUnknown(a.supplier.status?.replace(/_/g, ' '))} · lead time {a.supplier.lead_time_days ?? 'Unknown'}{a.supplier.lead_time_days ? ' days' : ''}</span>
              <button type="button" className="btn btn-icon btn-sm" style={{ marginLeft: 'auto' }} aria-label={`Detach ${a.supplier.name}`} onClick={async () => { await detachSupplier({ id: a.id }); router.refresh() }}><X size={14} aria-hidden /></button></header>
            <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 4 }}><legend className="sr-only">Sourcing checklist for {a.supplier.name}</legend>
              {SOURCING_STEPS.map(([k, label]) => <label key={k} className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 28 }}><input type="checkbox" checked={!!a.sourcing_checklist?.[k]} onChange={async (e) => { await setSourcingStep({ id: a.id, step: k, done: e.target.checked }); router.refresh() }} />{label}</label>)}
            </fieldset>
          </article>
        ))}
      </section>
      <section className="card" style={{ padding: 16 }} aria-label="Quotes">
        <h2 className="t-headline" style={{ margin: '0 0 12px' }}>Quotes</h2>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }} onSubmit={async (e) => { e.preventDefault(); const coId = await getCo(); if (!coId) return; const r = await addQuote({ supplierId: q.supplierId, coId, amount: Number(q.amount), quoteDate: q.date, validUntil: q.until || null }); if (!r.ok) return toast(r.error, { error: true }); toast('Quote added'); setQ({ ...q, amount: '', until: '' }); router.refresh() }}>
          <div><label className="field-label" htmlFor="qs">Supplier</label><select id="qs" className="select" style={{ width: 200 }} value={q.supplierId} onChange={(e) => setQ({ ...q, supplierId: e.target.value })}><option value="">Choose…</option>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="field-label" htmlFor="qa">Amount ($)</label><input id="qa" className="input num" style={{ width: 130 }} inputMode="decimal" value={q.amount} onChange={(e) => setQ({ ...q, amount: e.target.value.replace(/[^\d.]/g, '') })} /></div>
          <div><label className="field-label" htmlFor="qd">Quote date</label><input id="qd" className="input" type="date" value={q.date} onChange={(e) => setQ({ ...q, date: e.target.value })} /></div>
          <div><label className="field-label" htmlFor="qv">Valid until</label><input id="qv" className="input" type="date" value={q.until} onChange={(e) => setQ({ ...q, until: e.target.value })} /></div>
          <Button variant="primary" type="submit" disabled={!q.supplierId || !Number(q.amount)}>Add quote</Button>
        </form>
        {d.quotes.length === 0 ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>No quotes yet.</p> : (
          <table className="fp-table"><thead><tr>{['Supplier', 'Amount', 'Quote date', 'Valid until'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{d.quotes.map((x) => <tr key={x.id}><td>{names.get(x.supplier_id) ?? 'Unknown'}</td><td className="num">{fmtMoney(x.amount)}</td><td className="num">{fmtDate(x.quote_date)}</td><td className="num">{x.valid_until ? fmtDate(x.valid_until) : 'Unknown'}{expiring.some((e) => e.id === x.id) && <span className="badge tone-yellow" style={{ marginLeft: 8 }}>Expires before deadline</span>}</td></tr>)}</tbody></table>
        )}
        <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '12px 0 0' }}>Supplier data is never sent to the government or any third party. It reaches the AI only if you explicitly run an analysis that needs it.</p>
      </section>
    </div>
  )
}

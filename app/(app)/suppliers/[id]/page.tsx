import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SupplierForm } from '@/components/app/SupplierForm'
import { SupplierDelete } from '@/components/app/SupplierDelete'
import { Badge } from '@/components/ui/chips'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'
import { fmtDate, fmtMoney, orUnknown } from '@/lib/format'

export const metadata: Metadata = { title: 'Supplier' }
export const dynamic = 'force-dynamic'

export default async function SupplierPage({ params }: PageProps<'/suppliers/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const s = await requirePageSession()
  if (s.role === 'viewer') notFound()
  const { data: sup } = await s.supabase.from('suppliers').select('*').eq('id', id).maybeSingle()
  if (!sup) notFound()
  const [{ data: quotes }, { data: links }] = await Promise.all([
    s.supabase.from('supplier_quotes').select('id, amount, quote_date, valid_until, notes, company_opportunity_id, co:company_opportunities(opportunity_id, opp:opportunities(title))').eq('supplier_id', id).order('quote_date', { ascending: false }),
    s.supabase.from('opportunity_suppliers').select('id, co:company_opportunities(opportunity_id, opp:opportunities(id, title, response_deadline))').eq('supplier_id', id),
  ])
  return (
    <>
      <PageHeader title={sup.name} subtitle={<>{sup.status ? <Badge tone="gray">{String(sup.status).replace(/_/g, ' ')}</Badge> : 'Status unknown'} · lead time {sup.lead_time_days ?? 'Unknown'}{sup.lead_time_days ? ' days' : ''} · <Link href="/suppliers">All suppliers</Link></>} actions={<SupplierDelete id={id} name={sup.name} quoteCount={quotes?.length ?? 0} />} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
        <section className="card" style={{ padding: 16 }} aria-label="Edit supplier"><h2 className="t-headline" style={{ margin: '0 0 12px' }}>Details</h2><SupplierForm s={sup} onDone={() => undefined} /></section>
        <div style={{ display: 'grid', gap: 24 }}>
          <section className="card" style={{ padding: 16 }} aria-label="Quotes history"><h2 className="t-headline" style={{ margin: '0 0 12px' }}>Quotes</h2>
            {(quotes ?? []).length === 0 ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>No quotes recorded. Add quotes from an opportunity’s Suppliers tab.</p> : (
              <table className="fp-table"><thead><tr>{['Date', 'Amount', 'Valid until', 'Opportunity'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>{(quotes ?? []).map((q: any) => <tr key={q.id}><td className="num">{fmtDate(q.quote_date)}</td><td className="num">{fmtMoney(q.amount)}</td><td className="num">{q.valid_until ? fmtDate(q.valid_until) : 'Unknown'}</td><td>{q.co?.opp ? <Link href={`/opportunities/${q.co.opportunity_id}?tab=suppliers`}>{q.co.opp.title}</Link> : '—'}</td></tr>)}</tbody></table>)}
          </section>
          <section className="card" style={{ padding: 16 }} aria-label="Linked opportunities"><h2 className="t-headline" style={{ margin: '0 0 12px' }}>Linked opportunities</h2>
            {(links ?? []).length === 0 ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>Not attached to any opportunity.</p> : <ul style={{ margin: 0, paddingLeft: 18 }} className="t-callout">{(links ?? []).map((l: any) => <li key={l.id}><Link href={`/opportunities/${l.co?.opp?.id}?tab=suppliers`}>{orUnknown(l.co?.opp?.title)}</Link></li>)}</ul>}
          </section>
        </div>
      </div>
    </>
  )
}

'use client'
import { Plus, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/chips'
import { Sheet } from '@/components/ui/Dialog'
import { Empty } from '@/components/ui/states'
import { fmtDate, orUnknown } from '@/lib/format'
import { SupplierForm, type SupplierRow } from './SupplierForm'

type Row = SupplierRow & { id: string; lastQuote: string | null }
export function SuppliersView({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const sp = useSearchParams()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [open, setOpen] = useState(sp.get('new') === '1' && canWrite)
  const cats = useMemo(() => [...new Set(rows.flatMap((r) => r.categories))].sort(), [rows])
  const shown = rows.filter((r) => (!cat || r.categories.includes(cat)) && (!q || `${r.name} ${r.products.join(' ')} ${r.categories.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input className="input" style={{ width: 260 }} type="search" aria-label="Search suppliers" placeholder="Search name, product, category…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 200 }} aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
        <div style={{ flex: 1 }} />
        {canWrite && <Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />New supplier</Button>}
      </div>
      {rows.length === 0 ? <Empty icon={Truck} title="No suppliers yet" body="Add the manufacturers and distributors you source from, then attach them to opportunities and record quotes." action={canWrite ? <Button variant="primary" onClick={() => setOpen(true)}>Add supplier</Button> : undefined} /> : shown.length === 0 ? <Empty icon={Truck} title="No suppliers match" body="Try a different search or category." /> : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="fp-table" style={{ minWidth: 760 }}>
            <thead><tr>{['Name', 'Status', 'Categories', 'Lead time', 'Last quote'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}><td><Link href={`/suppliers/${r.id}`} style={{ fontWeight: 500, color: 'var(--label-primary)' }}>{r.name}</Link></td><td>{r.status ? <Badge tone="gray">{r.status.replace(/_/g, ' ')}</Badge> : 'Unknown'}</td><td>{r.categories.length ? r.categories.join(', ') : 'Unknown'}</td><td className="num">{r.lead_time_days != null ? `${r.lead_time_days} days` : 'Unknown'}</td><td className="num">{r.lastQuote ? fmtDate(r.lastQuote) : 'None'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen} title="New supplier" width={640}><SupplierForm onDone={(id) => { setOpen(false); router.push(`/suppliers/${id}`) }} /></Sheet>
    </>
  )
}
export { orUnknown }

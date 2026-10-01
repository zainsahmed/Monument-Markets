'use client'
import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { deleteSearch, toggleSearchAlerts } from '@/lib/actions/alerts'

interface R { id: string; name: string; alerts: boolean; href: string; chips: string[] }
export function SearchesView({ rows }: { rows: R[] }) {
  const [list, setList] = useState(rows)
  const router = useRouter()
  const { toast } = useToast()
  return (
    <ul className="card" style={{ listStyle: 'none', margin: 0, padding: '0 16px' }}>
      {list.map((r) => (
        <li key={r.id} className="hairline-b" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 0' }}>
          <div style={{ flex: 1, minWidth: 220 }}><Link href={r.href} className="t-callout" style={{ fontWeight: 600 }}>{r.name}</Link><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{r.chips.length ? r.chips.map((c) => <span key={c} className="chip">{c}</span>) : <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>No filters</span>}</div></div>
          <label className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={r.alerts} onChange={async (e) => { setList((l) => l.map((x) => (x.id === r.id ? { ...x, alerts: e.target.checked } : x))); const res = await toggleSearchAlerts({ id: r.id, enabled: e.target.checked }); if (!res.ok) toast(res.error, { error: true }) }} />Alerts</label>
          <Button variant="icon" aria-label={`Delete ${r.name}`} onClick={async () => { setList((l) => l.filter((x) => x.id !== r.id)); const res = await deleteSearch({ id: r.id }); if (!res.ok) { setList(rows); toast(res.error, { error: true }) } else { toast('Search deleted'); router.refresh() } }}><Trash2 size={16} /></Button>
        </li>
      ))}
    </ul>
  )
}

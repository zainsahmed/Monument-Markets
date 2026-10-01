'use client'
import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Empty } from '@/components/ui/states'
import { markAlertRead, markAllRead } from '@/lib/actions/alerts'
import { ALERT_TAB, ALERT_TYPES, type AlertType } from '@/lib/alerts'
import { timeAgo } from '@/lib/format'

export interface AlertRow { id: string; type: AlertType; title: string; opportunity_id: string | null; link_tab: string | null; created_at: string; read_at: string | null }
export function AlertsView({ rows }: { rows: AlertRow[] }) {
  const [list, setList] = useState(rows)
  const [type, setType] = useState('')
  const router = useRouter()
  const shown = list.filter((a) => !type || a.type === type)
  const unread = list.filter((a) => !a.read_at).length
  const toggle = async (a: AlertRow, read: boolean) => { setList((l) => l.map((x) => (x.id === a.id ? { ...x, read_at: read ? new Date().toISOString() : null } : x))); await markAlertRead({ id: a.id, read }); router.refresh() }
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ width: 280 }} aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All alert types</option>{ALERT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select>
        <span className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{unread} unread</span><div style={{ flex: 1 }} />
        <Button disabled={!unread} onClick={async () => { setList((l) => l.map((a) => (!type || a.type === type ? { ...a, read_at: a.read_at ?? new Date().toISOString() } : a))); await markAllRead({ type: type || undefined }); router.refresh() }}><CheckCheck size={14} aria-hidden />Mark all read</Button>
        <Link href="/alerts/preferences" className="btn btn-secondary">Preferences</Link>
      </div>
      {shown.length === 0 ? <Empty icon={Bell} title="No alerts" body="You’ll be told about deadlines, amendments, new attachments and matches for your saved searches." action={<Link href="/alerts/preferences" className="btn btn-primary">Alert preferences</Link>} /> : (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }} aria-label="Alerts">
          {shown.map((a) => (
            <li key={a.id} className="hairline-b" style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 56, padding: '8px 16px' }}>
              <span aria-label={a.read_at ? 'Read' : 'Unread'} style={{ width: 8, height: 8, borderRadius: 4, background: a.read_at ? 'transparent' : 'var(--accent)', flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.opportunity_id ? <Link href={`/opportunities/${a.opportunity_id}?tab=${a.link_tab ?? ALERT_TAB[a.type]}`} onClick={() => !a.read_at && void toggle(a, true)} className="t-callout" style={{ color: 'var(--label-primary)', fontWeight: a.read_at ? 400 : 600 }}>{a.title}</Link> : <span className="t-callout">{a.title}</span>}
                <div className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{ALERT_TYPES.find((t) => t.type === a.type)?.label} · <time dateTime={a.created_at}>{timeAgo(a.created_at)}</time></div>
              </div>
              <Button small variant="plain" onClick={() => toggle(a, !a.read_at)}>{a.read_at ? 'Mark unread' : 'Mark read'}</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

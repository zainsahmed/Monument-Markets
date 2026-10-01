'use client'
import { Empty } from '@/components/ui/states'
import { History } from 'lucide-react'
import { fmtDeadline, timeAgo } from '@/lib/format'
import type { DetailData } from '@/lib/data/detail'

const ACTION: Record<string, string> = {
  workflow_status_changed: 'changed workflow status', saved: 'saved the opportunity', unsaved: 'removed it from saved', added_to_pipeline: 'added it to the pipeline', stage_moved: 'moved the pipeline stage',
  brief_generated: 'generated a Pursuit Brief', documents_fetched: 'fetched documents from SAM.gov', amendment_detected: 'Amendment detected on SAM.gov', checklist_status_changed: 'changed a checklist item', ai_suggestion_accepted: 'accepted an AI suggestion',
  note_added: 'added a note', note_deleted: 'deleted a note', pricing_saved: 'saved a pricing scenario', quote_added: 'added a supplier quote', supplier_attached: 'attached a supplier', dibbs_imported: 'imported this DIBBS RFQ', dibbs_reimported: 'reimported this DIBBS RFQ',
}
const FIELD: Record<string, string> = { title: 'Title', response_deadline: 'Response deadline', archive_date: 'Archive date', naics: 'NAICS', psc: 'PSC', set_aside_code: 'Set-aside', active: 'Active', cancelled: 'Cancelled', award: 'Award', contacts: 'Contacts', resource_links: 'Attachments', notice_type: 'Notice type', solicitation_number: 'Solicitation #', pop_city: 'City', pop_state: 'State', pop_zip: 'ZIP', pop_country: 'Country', notice_type_code: 'Type code' }
const show = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'Unknown'
  if (field === 'response_deadline' && typeof v === 'string') return fmtDeadline(v, v)
  if (Array.isArray(v)) return field === 'resource_links' ? `${v.length} file${v.length === 1 ? '' : 's'}` : `${v.length} item${v.length === 1 ? '' : 's'}`
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/** Chronological audit trail: amendments (field-level diffs) and user/system actions. */
export function ActivityTab({ d }: { d: DetailData }) {
  const items = [
    ...d.amendments.map((a) => ({ t: a.detected_at, kind: 'diff' as const, a })),
    ...d.activity.filter((x) => x.action !== 'amendment_detected').map((x) => ({ t: x.created_at, kind: 'act' as const, x })),
  ].sort((p, q) => q.t.localeCompare(p.t))
  if (!items.length) return <Empty icon={History} title="No activity yet" body="Syncs, amendments, status changes, analyses and edits will appear here." />
  return (
    <ol className="card" style={{ listStyle: 'none', margin: 0, padding: '8px 16px' }} aria-label="Activity">
      {items.map((it, i) => (
        <li key={i} className="hairline-b" style={{ padding: '12px 0', display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12 }}>
          <time dateTime={it.t} className="t-footnote num" style={{ color: 'var(--label-secondary)' }} title={new Date(it.t).toLocaleString()}>{timeAgo(it.t)}</time>
          {it.kind === 'diff' ? (
            <div className="t-callout"><strong>Amendment detected</strong> — {FIELD[it.a.field] ?? it.a.field} changed<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}><span className="chip" style={{ textDecoration: 'line-through', color: 'var(--label-secondary)' }}>{show(it.a.field, it.a.old_value)}</span><span aria-hidden>→</span><span className="chip">{show(it.a.field, it.a.new_value)}</span></div></div>
          ) : (
            <div className="t-callout"><strong>{it.x.actor ?? 'System'}</strong> {ACTION[it.x.action] ?? it.x.action.replace(/_/g, ' ')}
              {it.x.action === 'stage_moved' && it.x.after ? <span style={{ color: 'var(--label-secondary)' }}> → {String((it.x.after as { stage?: string }).stage ?? '').replace(/_/g, ' ')}</span> : null}
              {it.x.action === 'workflow_status_changed' && it.x.after ? <span style={{ color: 'var(--label-secondary)' }}> → {String((it.x.after as { workflow_status?: string }).workflow_status)}</span> : null}
              {it.x.action === 'checklist_status_changed' && it.x.after ? <span style={{ color: 'var(--label-secondary)' }}> ({String((it.x.before as { key?: string } | null)?.key ?? '')}: {String((it.x.before as { status?: string } | null)?.status)} → {String((it.x.after as { status?: string }).status)})</span> : null}</div>
          )}
        </li>
      ))}
    </ol>
  )
}

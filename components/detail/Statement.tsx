'use client'
import { useRouter, usePathname } from 'next/navigation'
import { LabelChip } from '@/components/ui/chips'
import { Popover } from '@/components/ui/Popover'
import { Button } from '@/components/ui/Button'
import type { Citation, Label } from '@/lib/ai/citations'

export interface DocNames { [id: string]: string }
export const NOTICE_PREFIX = 'notice:'

/** Footnote-style superscript citation. Popover shows document, page, section, exact snippet and "Open in viewer". */
export function CiteMark({ n, c, docNames }: { n: number; c: Citation; docNames: DocNames }) {
  const router = useRouter()
  const path = usePathname()
  const isNotice = c.documentId.startsWith(NOTICE_PREFIX)
  const name = isNotice ? 'Stored notice record' : docNames[c.documentId] ?? 'Document'
  const open = () => {
    const sp = new URLSearchParams(location.search)
    if (isNotice) { sp.set('tab', 'overview'); sp.delete('doc') } else { sp.set('tab', 'documents'); sp.set('doc', c.documentId); sp.set('page', String(c.page || 1)); sp.set('hl', c.snippet) }
    router.push(`${path}?${sp}`, { scroll: false })
  }
  return (
    <Popover width={360} trigger={<button type="button" className="cite" aria-label={`Citation ${n}: ${name}${c.page ? `, page ${c.page}` : ''}`}>{n}</button>}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="t-subheadline">{name}</div>
        <div className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{[c.page ? `Page ${c.page}` : 'Page unavailable', c.section && `Section: ${c.section}`].filter(Boolean).join(' · ')}</div>
        <blockquote className="t-callout" style={{ margin: 0, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--accent)' }}>“{c.snippet}”</blockquote>
        <Button small variant="secondary" onClick={open}>{isNotice ? 'Open notice record' : 'Open in viewer'}</Button>
      </div>
    </Popover>
  )
}

export function StatementView({ text, label, citations, docNames, prefix }: { text: string; label: Label; citations: Citation[]; docNames: DocNames; prefix?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <p className="t-body" style={{ margin: 0, flex: 1 }}>
        {prefix}{text}{citations.map((c, i) => <CiteMark key={i} n={i + 1} c={c} docNames={docNames} />)}
      </p>
      <span style={{ flex: 'none', marginTop: 2 }}><LabelChip label={label} /></span>
    </div>
  )
}

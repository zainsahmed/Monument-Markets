'use client'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Dialog'
import { LabelChip } from '@/components/ui/chips'
import { filterChips, type Filters } from '@/lib/search'

/** Natural language → editable filters. The AI returns filters only, never result rows (spec §7.3). */
export function AiSearchSheet({ open, onOpenChange, onApply, enabled }: { open: boolean; onOpenChange: (o: boolean) => void; onApply: (f: Filters) => void; enabled: boolean }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<{ filters: Filters; unmapped: string[]; suggestions: string[] } | null>(null)
  async function go() {
    setBusy(true); setErr(null); setRes(null)
    try {
      const r = await fetch('/api/search/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })
      const j = await r.json()
      if (!r.ok) setErr(j.error ?? 'AI search is unavailable. Standard filters still work.')
      else setRes(j)
    } catch { setErr('Could not reach the server. Standard filters still work.') }
    setBusy(false)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="AI search" description="Describe what you’re looking for. Fieldpoint turns it into filters you can edit — the AI never produces results itself.">
      <form onSubmit={(e) => { e.preventDefault(); void go() }} style={{ display: 'grid', gap: 12 }}>
        <textarea className="textarea" rows={3} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Active DoD solicitations under $500,000 for hydraulic parts in Alabama" aria-label="Search request" />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Button variant="primary" type="submit" disabled={busy || q.trim().length < 3 || !enabled}><Sparkles size={14} aria-hidden />{busy ? 'Thinking…' : 'Make filters'}</Button><LabelChip label="ANALYSIS" /></div>
        {!enabled && <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: 0 }}>Viewers can’t run AI searches.</p>}
        {err && <p role="alert" className="t-callout" style={{ color: 'var(--red)', margin: 0 }}>{err}</p>}
      </form>
      {res && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{filterChips(res.filters).map((c) => <span key={c.label + c.value} className="chip"><span style={{ color: 'var(--label-secondary)' }}>{c.label}:&nbsp;</span>{c.value}</span>)}{filterChips(res.filters).length === 0 && <span className="t-callout" style={{ color: 'var(--label-secondary)' }}>No filters could be derived.</span>}</div>
          {res.unmapped.length > 0 && <div className="card" style={{ padding: 12, background: 'var(--yellow-fill)', color: 'var(--yellow)' }}><strong className="t-subheadline">Couldn’t turn into a filter:</strong> {res.unmapped.join('; ')}{res.suggestions.length > 0 && <><br /><strong className="t-subheadline">Closest filters:</strong> {res.suggestions.join('; ')}</>}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="plain" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => { onApply(res.filters); onOpenChange(false) }}>Apply and edit</Button></div>
        </div>
      )}
    </Sheet>
  )
}

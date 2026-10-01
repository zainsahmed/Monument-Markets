'use client'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Popover } from '@/components/ui/Popover'
import { NOTICE_LABELS } from '@/lib/sam/notice-types'
import { filterChips, type Chip, type Filters } from '@/lib/search'

type FieldKey = 'departments' | 'naics' | 'psc' | 'setAsides' | 'states' | 'noticeTypes' | 'posted' | 'deadline' | 'value' | 'active' | 'zip'
const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: 'departments', label: 'Agency' }, { key: 'naics', label: 'NAICS' }, { key: 'psc', label: 'PSC' }, { key: 'setAsides', label: 'Set-aside' },
  { key: 'states', label: 'Location (state)' }, { key: 'zip', label: 'ZIP' }, { key: 'posted', label: 'Posted' }, { key: 'deadline', label: 'Deadline' },
  { key: 'noticeTypes', label: 'Notice type' }, { key: 'value', label: 'Value' }, { key: 'active', label: 'Active' },
]
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
const keyOfChip = (c: Chip): FieldKey => (c.key === 'postedFrom' ? 'posted' : c.key === 'deadlineFrom' ? 'deadline' : c.key === 'valueMin' || c.key === 'valueMax' ? 'value' : (c.key as FieldKey))

function Editor({ field, f, apply, close }: { field: FieldKey; f: Filters; apply: (p: Partial<Filters>) => void; close: () => void }) {
  const [text, setText] = useState(() => (['departments', 'naics', 'psc', 'setAsides', 'states'] as const).includes(field as never) ? (f[field as 'departments'] ?? []).join(', ') : field === 'zip' ? f.zip ?? '' : '')
  const [a, setA] = useState(() => (field === 'posted' ? f.postedFrom ?? '' : field === 'deadline' ? f.deadlineFrom ?? '' : field === 'value' ? String(f.valueMin ?? '') : ''))
  const [b, setB] = useState(() => (field === 'posted' ? f.postedTo ?? '' : field === 'deadline' ? f.deadlineTo ?? '' : field === 'value' ? String(f.valueMax ?? '') : ''))
  const [types, setTypes] = useState<string[]>(f.noticeTypes)
  const done = (p: Partial<Filters>) => { apply(p); close() }
  const hint: Partial<Record<FieldKey, string>> = { departments: 'e.g. DEPT OF DEFENSE (matches exactly)', naics: 'e.g. 336413, 332710', psc: 'e.g. 1560, 4320', setAsides: 'SAM codes: SBA, 8A, HZC, SDVOSBC, WOSB…', states: 'Two-letter codes: AL, TX' }
  return (
    <form onSubmit={(e) => { e.preventDefault(); switch (field) {
      case 'departments': case 'naics': case 'psc': case 'setAsides': return done({ [field]: list(text) } as Partial<Filters>)
      case 'states': return done({ states: list(text).map((s) => s.toUpperCase()) })
      case 'zip': return done({ zip: text.trim() || undefined })
      case 'posted': return done({ postedFrom: a || undefined, postedTo: b || undefined })
      case 'deadline': return done({ deadlineFrom: a || undefined, deadlineTo: b || undefined })
      case 'value': return done({ valueMin: a ? Number(a) : undefined, valueMax: b ? Number(b) : undefined })
      case 'noticeTypes': return done({ noticeTypes: types })
      case 'active': return done({ active: true })
    } }} style={{ display: 'grid', gap: 12 }}>
      <strong className="t-subheadline">{FIELDS.find((x) => x.key === field)?.label}</strong>
      {(['departments', 'naics', 'psc', 'setAsides', 'states', 'zip'] as FieldKey[]).includes(field) && (<div><input className="input" aria-label="Values" autoFocus value={text} onChange={(e) => setText(e.target.value)} /><p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '4px 0 0' }}>{hint[field] ?? 'Prefix match'} — separate with commas.</p></div>)}
      {(field === 'posted' || field === 'deadline') && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><div><label className="field-label">From</label><input className="input" type="date" value={a} onChange={(e) => setA(e.target.value)} /></div><div><label className="field-label">To</label><input className="input" type="date" value={b} onChange={(e) => setB(e.target.value)} /></div></div>)}
      {field === 'value' && (<><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><div><label className="field-label">Min ($)</label><input className="input num" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/[^\d.]/g, ''))} /></div><div><label className="field-label">Max ($)</label><input className="input num" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/[^\d.]/g, ''))} /></div></div><p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: 0 }}>Only notices with a stated value (e.g. award notices) can match; most solicitations state none.</p></>)}
      {field === 'noticeTypes' && (<div style={{ display: 'grid', gap: 4 }}>{Object.entries(NOTICE_LABELS).map(([code, label]) => (<label key={code} className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 28 }}><input type="checkbox" checked={types.includes(code)} onChange={(e) => setTypes((t) => (e.target.checked ? [...t, code] : t.filter((x) => x !== code)))} />{label}</label>))}</div>)}
      {field === 'active' && <p className="t-callout" style={{ margin: 0 }}>Only notices that are currently active.</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="plain" onClick={close}>Cancel</Button><Button variant="primary" type="submit">Apply</Button></div>
    </form>
  )
}

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [open, setOpen] = useState<FieldKey | null>(null)
  const chips = filterChips(filters)
  const clear = (c: Chip) => {
    const k = keyOfChip(c)
    const patch: Partial<Filters> = k === 'posted' ? { postedFrom: undefined, postedTo: undefined } : k === 'deadline' ? { deadlineFrom: undefined, deadlineTo: undefined } : k === 'value' ? { valueMin: undefined, valueMax: undefined } : k === 'active' ? { active: undefined } : k === 'zip' ? { zip: undefined } : c.key === 'q' ? { q: undefined } : c.key === 'source' ? { source: undefined } : { [k]: [] }
    onChange({ ...filters, ...patch })
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} role="group" aria-label="Filters">
      {chips.filter((c) => c.key !== 'source').map((c) => (
        <span key={c.label + c.value} className="chip" style={{ paddingRight: 4 }}>
          <Popover width={300} trigger={<button type="button" className="t-footnote" style={{ background: 'none', border: 0, padding: 0 }}><span style={{ color: 'var(--label-secondary)' }}>{c.label}: </span>{c.value}</button>}>
            {c.key !== 'q' && <Editor field={keyOfChip(c)} f={filters} apply={(p) => onChange({ ...filters, ...p })} close={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} />}
            {c.key === 'q' && <p className="t-callout" style={{ margin: 0 }}>Keyword search covers titles, solicitation numbers, agencies, fetched descriptions and extracted document text.</p>}
          </Popover>
          <button type="button" className="btn btn-icon" style={{ width: 20, height: 20, padding: 0 }} aria-label={`Remove ${c.label} filter`} onClick={() => clear(c)}><X size={12} aria-hidden /></button>
        </span>
      ))}
      <Popover width={300} trigger={<Button small><Plus size={14} aria-hidden />Filter</Button>}>
        {open ? <Editor field={open} f={filters} apply={(p) => onChange({ ...filters, ...p })} close={() => setOpen(null)} /> : (
          <div style={{ display: 'grid', gap: 2 }} role="menu">{FIELDS.map((x) => <button key={x.key} role="menuitem" type="button" className="side-item" style={{ background: 'none', border: 0, height: 32, textAlign: 'left' }} onClick={() => setOpen(x.key)}>{x.label}</button>)}</div>
        )}
      </Popover>
    </div>
  )
}

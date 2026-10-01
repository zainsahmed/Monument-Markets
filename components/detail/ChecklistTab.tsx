'use client'
import { Check, ClipboardList, Sparkles } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { InfoPopover } from '@/components/ui/Popover'
import { Seg } from '@/components/ui/Seg'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { startChecklist } from '@/lib/actions/opportunities'
import { acceptSuggestion, setChecklistNote, setChecklistStatus } from '@/lib/actions/work'
import { GROUPS, summarizeChecklist, type ChecklistStatus } from '@/lib/checklist'
import type { DetailData } from '@/lib/data/detail'
import { useRouter } from 'next/navigation'
import { CiteMark, type DocNames } from './Statement'
import { LabelChip } from '@/components/ui/chips'

const OPTS: Array<{ value: ChecklistStatus; label: string }> = [{ value: 'PASS', label: 'Pass' }, { value: 'FAIL', label: 'Fail' }, { value: 'UNKNOWN', label: 'Unknown' }, { value: 'NA', label: 'N/A' }]
const ICON: Record<ChecklistStatus, string> = { PASS: '✓', FAIL: '✕', UNKNOWN: '?', NA: '–' }

/** "Can we bid this?" — AI may suggest (ghost), only the user sets a status. UNKNOWN never becomes PASS on its own. */
export function ChecklistTab({ d, canWrite, docNames }: { d: DetailData; canWrite: boolean; docNames: DocNames }) {
  const [items, setItems] = useState(d.checklist)
  const [pending, start] = useTransition()
  const { toast } = useToast()
  const router = useRouter()
  const sum = summarizeChecklist(items)

  if (!items.length) return <Empty icon={ClipboardList} title="No checklist yet" body="Start the “Can we bid this?” checklist. Every item begins as Unknown — nothing is assumed." action={canWrite ? <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await startChecklist({ opportunityId: d.opp.id }); if (!r.ok) toast(r.error, { error: true }); else router.refresh() })}>Start checklist</Button> : undefined} />

  const set = async (id: string, status: ChecklistStatus, via: 'user' | 'accept') => {
    const prev = items.find((i) => i.id === id)!.status
    setItems((l) => l.map((i) => (i.id === id ? { ...i, status } : i)))
    const r = via === 'accept' ? await acceptSuggestion({ itemId: id }) : await setChecklistStatus({ itemId: id, status })
    if (!r.ok) { setItems((l) => l.map((i) => (i.id === id ? { ...i, status: prev } : i))); toast(r.error, { error: true }) } else toast('Updated', { undo: () => { setItems((l) => l.map((i) => (i.id === id ? { ...i, status: prev } : i))); void setChecklistStatus({ itemId: id, status: prev }) } })
  }
  const groups = [...GROUPS.map((g) => [g, items.filter((i) => i.group === g)] as const), ['Other', items.filter((i) => !(GROUPS as readonly string[]).includes(i.group))] as const].filter(([, l]) => l.length)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 3 }} role="status" aria-live="polite">
        <div style={{ display: 'flex', gap: 12 }} className="num">
          {([['PASS', sum.pass, 'var(--green)'], ['FAIL', sum.fail, 'var(--red)'], ['UNKNOWN', sum.unknown, 'var(--yellow)'], ['N/A', sum.na, 'var(--gray)']] as const).map(([k, n, c]) => <span key={k} className="t-callout"><strong style={{ color: c }}>{n}</strong> <span style={{ color: 'var(--label-secondary)' }}>{k.toLowerCase()}</span></span>)}
        </div>
        <strong className="t-callout" style={{ color: sum.ready ? 'var(--green)' : 'var(--label-primary)' }}>{sum.statement}</strong>
        <span className="t-footnote" style={{ color: 'var(--label-secondary)', marginLeft: 'auto' }}>No score — you decide.</span>
      </div>
      {groups.map(([g, list]) => (
        <section key={g} className="card" style={{ padding: '8px 16px' }} aria-label={g}>
          <h2 className="t-headline" style={{ margin: '8px 0' }}>{g}</h2>
          {list.map((it) => {
            const sug = it.ai_suggestion
            const hint = d.hints[it.key]
            const showSug = sug && sug.status !== it.status && ['PASS', 'FAIL', 'UNKNOWN', 'NA'].includes(sug.status)
            return (
              <div key={it.id} className="hairline-b" style={{ padding: '12px 0', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span aria-hidden style={{ width: 20, textAlign: 'center', fontWeight: 700, color: it.status === 'PASS' ? 'var(--green)' : it.status === 'FAIL' ? 'var(--red)' : it.status === 'UNKNOWN' ? 'var(--yellow)' : 'var(--gray)' }}>{ICON[it.status]}</span>
                  <span className="t-body" style={{ flex: 1, minWidth: 200 }}>{it.label}</span>
                  {canWrite ? <Seg label={it.label} value={it.status} onChange={(v) => set(it.id, v, 'user')} options={OPTS} /> : <span className="badge tone-gray">{it.status}</span>}
                </div>
                {showSug && (
                  <div className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 32, padding: '6px 10px', border: '1px dashed var(--label-tertiary)', borderRadius: 'var(--radius-md)', color: 'var(--label-secondary)' }}>
                    <Sparkles size={14} color="var(--accent)" aria-hidden /><span>AI suggests <strong>{sug.status === 'NA' ? 'N/A' : sug.status.toLowerCase()}</strong> — {sug.rationale}{sug.citations.map((c, i) => <CiteMark key={i} n={i + 1} c={c} docNames={docNames} />)}</span>
                    <LabelChip label={(sug.label as 'ANALYSIS') ?? 'ANALYSIS'} />
                    {canWrite && <Button small variant="secondary" onClick={() => set(it.id, sug.status as ChecklistStatus, 'accept')}><Check size={12} aria-hidden />Accept</Button>}
                  </div>
                )}
                {hint && hint.status !== it.status && it.status === 'UNKNOWN' && <p className="t-footnote" style={{ margin: '0 0 0 32px', color: 'var(--label-secondary)' }}>From your profile: suggests {hint.status.toLowerCase()} — {hint.why} <InfoPopover label="About profile suggestions">Suggestions from your company profile are never applied automatically. Set the status yourself.</InfoPopover></p>}
                {canWrite && <input className="input" style={{ marginLeft: 32, width: 'calc(100% - 32px)' }} aria-label={`Note for ${it.label}`} placeholder="Add a note or evidence…" defaultValue={it.note ?? ''} onBlur={(e) => { if (e.target.value !== (it.note ?? '')) void setChecklistNote({ itemId: it.id, note: e.target.value }) }} />}
                {!canWrite && it.note && <p className="t-callout" style={{ margin: '0 0 0 32px' }}>{it.note}</p>}
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

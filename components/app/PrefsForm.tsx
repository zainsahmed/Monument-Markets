'use client'
import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { savePreference } from '@/lib/actions/alerts'
import { ALERT_TYPES, DEFAULT_OFFSETS } from '@/lib/alerts'

type P = { type: string; in_app: boolean; email: boolean; digest: boolean; deadline_offsets: number[] }
export function PrefsForm({ initial, emailConfigured }: { initial: P[]; emailConfigured: boolean }) {
  const [prefs, setPrefs] = useState<Record<string, P>>(Object.fromEntries(ALERT_TYPES.map((t) => [t.type, initial.find((p) => p.type === t.type) ?? { type: t.type, in_app: true, email: false, digest: true, deadline_offsets: DEFAULT_OFFSETS }])))
  const { toast } = useToast()
  const [offsetText, setOffsetText] = useState((prefs.deadline?.deadline_offsets ?? DEFAULT_OFFSETS).join(', '))
  const save = async (type: string, patch: Partial<P>) => {
    const next = { ...prefs[type], ...patch }
    setPrefs((p) => ({ ...p, [type]: next }))
    const r = await savePreference({ type, in_app: next.in_app, email: next.email, digest: next.digest, deadline_offsets: type === 'deadline' ? next.deadline_offsets : undefined })
    if (!r.ok) { setPrefs((p) => ({ ...p, [type]: prefs[type] })); toast(r.error, { error: true }) }
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {!emailConfigured && <p role="note" className="card t-callout" style={{ margin: 0, padding: 12, background: 'var(--yellow-fill)', color: 'var(--yellow)' }}>Email delivery isn’t configured on this server (no RESEND_API_KEY). In-app alerts still work.</p>}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="fp-table" style={{ minWidth: 640 }}>
          <thead><tr><th scope="col">Alert</th><th scope="col">In-app</th><th scope="col">Email</th><th scope="col">Daily digest</th></tr></thead>
          <tbody>{ALERT_TYPES.map((t) => { const p = prefs[t.type]; return (
            <tr key={t.type} style={{ height: 44 }}><th scope="row" style={{ position: 'static', fontWeight: 400, color: 'var(--label-primary)' }}>{t.label}</th>
              <td><input type="checkbox" aria-label={`${t.label}: in-app`} checked={p.in_app} onChange={(e) => save(t.type, { in_app: e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${t.label}: email`} checked={p.email} onChange={(e) => save(t.type, { email: e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${t.label}: digest instead of immediate`} checked={p.digest} disabled={!p.email} onChange={(e) => save(t.type, { digest: e.target.checked })} /></td></tr>) })}</tbody>
        </table>
      </div>
      <section className="card" style={{ padding: 16 }}>
        <label className="field-label" htmlFor="off">Deadline reminders — days before the deadline</label>
        <input id="off" className="input num" style={{ maxWidth: 240 }} value={offsetText} onChange={(e) => setOffsetText(e.target.value)} onBlur={() => { const n = offsetText.split(/[,\s]+/).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 60); if (!n.length) { setOffsetText(prefs.deadline.deadline_offsets.join(', ')); return toast('Enter whole days, e.g. 7, 3, 1', { error: true }) } void save('deadline', { deadline_offsets: n }); setOffsetText([...new Set(n)].sort((a, b) => b - a).join(', ')) }} />
        <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '4px 0 0' }}>Default 7, 3, 1. You get one reminder per reached offset.</p>
      </section>
    </div>
  )
}

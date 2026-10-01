'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/chips'
import { Seg } from '@/components/ui/Seg'
import { useToast } from '@/components/ui/Toast'
import { changeMemberRole, inviteMember, removeMember, resetChecklistTemplate, revokeInvite, saveChecklistTemplate, savePreferences, updateLimits } from '@/lib/actions/company'
import { GROUPS, type TemplateItem } from '@/lib/checklist'
import type { SyncStatus } from '@/lib/data/dashboard'
import { fmtMoney, timeAgo } from '@/lib/format'

const SECTIONS = [['team', 'Team & roles'], ['notifications', 'Notifications'], ['appearance', 'Appearance'], ['checklist', 'Checklist template'], ['ai', 'AI usage'], ['sync', 'Data sync'], ['audit', 'Audit log']] as const
type Sec = (typeof SECTIONS)[number][0]
interface Props { role: string; me: string; company: { ai_monthly_cap_usd: number; max_upload_mb: number }; members: Array<{ id: string; user_id: string; role: string; email: string; name: string | null }>; invites: Array<{ id: string; email: string; role: string }>; template: TemplateItem[]; customTemplate: boolean; spend: number; analyses: Array<{ id: string; created_at: string; kind: string; model: string; cost_usd: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; status: string; citation_rejections: number; citation_total: number }>; audit: Array<{ id: string; created_at: string; actor: string; entity_type: string; action: string }>; sync: SyncStatus; samConfigured: boolean }

export function SettingsView(p: Props) {
  const [sec, setSec] = useState<Sec>('team')
  const owner = p.role === 'owner'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: 24, alignItems: 'start' }} className="fp-settings">
      <nav aria-label="Settings sections" style={{ display: 'grid', gap: 2 }}>{SECTIONS.map(([k, l]) => <button key={k} type="button" className="side-item" aria-current={sec === k ? 'page' : undefined} onClick={() => setSec(k)} style={{ background: 'none', border: 0, textAlign: 'left', height: 32 }}>{l}</button>)}</nav>
      <div className="card" style={{ padding: 24, minWidth: 0 }}>
        {sec === 'team' && <Team {...p} owner={owner} />}
        {sec === 'notifications' && <><h2 className="t-title3" style={{ margin: '0 0 8px' }}>Notifications</h2><p className="t-callout" style={{ color: 'var(--label-secondary)' }}>Choose which alerts reach you in-app and by email, and when deadline reminders fire.</p><a href="/alerts/preferences" className="btn btn-primary">Open alert preferences</a></>}
        {sec === 'appearance' && <Appearance />}
        {sec === 'checklist' && <Template {...p} owner={owner} />}
        {sec === 'ai' && <Ai {...p} owner={owner} />}
        {sec === 'sync' && <Sync {...p} owner={owner} />}
        {sec === 'audit' && <Audit {...p} />}
      </div>
    </div>
  )
}

function Team({ members, invites, me, owner }: Props & { owner: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'viewer' | 'owner'>('member')
  const router = useRouter()
  const { toast } = useToast()
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>Team & roles</h2>
      <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>Owners manage everything. Members work on all opportunity data. Viewers are read-only and can’t see supplier or pricing data.</p>
      <table className="fp-table"><thead><tr><th scope="col">Person</th><th scope="col">Role</th><th /></tr></thead>
        <tbody>{members.map((m) => (<tr key={m.id}><td>{m.name ?? m.email}{m.user_id === me && <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}> (you)</span>}<div className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{m.email}</div></td>
          <td>{owner ? <select className="select" style={{ width: 130 }} aria-label={`Role for ${m.email}`} value={m.role} onChange={async (e) => { const r = await changeMemberRole({ memberId: m.id, role: e.target.value }); if (!r.ok) toast(r.error, { error: true }); router.refresh() }}><option value="owner">Owner</option><option value="member">Member</option><option value="viewer">Viewer</option></select> : <Badge>{m.role}</Badge>}</td>
          <td>{owner && m.user_id !== me && <Button small variant="destructive" onClick={async () => { const r = await removeMember({ memberId: m.id }); if (!r.ok) toast(r.error, { error: true }); else toast('Member removed'); router.refresh() }}>Remove</Button>}</td></tr>))}</tbody></table>
      {owner && invites.length > 0 && <div><h3 className="t-subheadline" style={{ margin: '0 0 8px' }}>Pending invites</h3>{invites.map((i) => <div key={i.id} className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 36 }}><span style={{ flex: 1 }}>{i.email} · {i.role}</span><Button small variant="plain" onClick={async () => { await revokeInvite({ id: i.id }); router.refresh() }}>Revoke</Button></div>)}</div>}
      {owner && <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={async (e) => { e.preventDefault(); const r = await inviteMember({ email, role }); if (!r.ok) return toast(r.error, { error: true }); toast(r.data.joined ? 'Added to your company' : 'Invite saved — they join when they sign in with that email'); setEmail(''); router.refresh() }}>
        <div><label className="field-label" htmlFor="ie">Add by email</label><input id="ie" className="input" type="email" style={{ width: 260 }} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <select className="select" style={{ width: 130 }} aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="member">Member</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select>
        <Button variant="primary" type="submit" disabled={!email}>Add</Button></form>}
    </div>
  )
}

function Appearance() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [dens, setDens] = useState<'compact' | 'comfortable'>('compact')
  useEffect(() => { try { const t = localStorage.getItem('fp-theme'); if (t === 'light' || t === 'dark') setTheme(t); const d = localStorage.getItem('fp-density'); if (d === 'comfortable') setDens('comfortable') } catch { /* ignore */ } }, [])
  const applyTheme = (t: typeof theme) => { setTheme(t); try { t === 'system' ? localStorage.removeItem('fp-theme') : localStorage.setItem('fp-theme', t) } catch { /* ignore */ } if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t; void savePreferences({ theme: t }) }
  const applyDens = (d: typeof dens) => { setDens(d); try { localStorage.setItem('fp-density', d) } catch { /* ignore */ } document.documentElement.dataset.density = d; void savePreferences({ density: d }) }
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>Appearance</h2>
      <div><div className="field-label">Theme</div><Seg label="Theme" value={theme} onChange={applyTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
      <div><div className="field-label">Table density</div><Seg label="Table density" value={dens} onChange={applyDens} options={[{ value: 'compact', label: 'Compact (36 px rows)' }, { value: 'comfortable', label: 'Comfortable (44 px rows)' }]} /></div>
    </div>
  )
}

function Template({ template, customTemplate, owner }: Props & { owner: boolean }) {
  const [items, setItems] = useState(template)
  const [label, setLabel] = useState('')
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Eligibility')
  const router = useRouter()
  const { toast } = useToast()
  const save = async (next: TemplateItem[]) => { const r = await saveChecklistTemplate({ items: next }); if (!r.ok) return toast(r.error, { error: true }); setItems(next); toast('Template saved — applies to checklists started from now on'); router.refresh() }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>Checklist template</h2>
      <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>{customTemplate ? 'Custom template.' : 'Default template.'} Changes apply to new checklists; existing ones keep their items.</p>
      {GROUPS.map((g) => <div key={g}><h3 className="t-subheadline" style={{ margin: '0 0 4px' }}>{g}</h3>{items.filter((i) => i.group === g).map((i) => <div key={i.key} className="hairline-b t-callout" style={{ display: 'flex', alignItems: 'center', minHeight: 36 }}><span style={{ flex: 1 }}>{i.label}</span>{owner && <Button small variant="plain" onClick={() => void save(items.filter((x) => x.key !== i.key))}>Remove</Button>}</div>)}</div>)}
      {owner && <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={async (e) => { e.preventDefault(); const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'custom'; if (items.some((x) => x.key === key)) return toast('An item with that name exists', { error: true }); await save([...items, { group, key, label: label.trim() }]); setLabel('') }}>
        <select className="select" style={{ width: 180 }} aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
        <input className="input" style={{ flex: 1, minWidth: 200 }} aria-label="New item" placeholder="New checklist item" value={label} onChange={(e) => setLabel(e.target.value)} /><Button variant="primary" type="submit" disabled={label.trim().length < 2}>Add item</Button>
        {customTemplate && <Button onClick={async () => { const r = await resetChecklistTemplate(); if (r.ok) { setItems(r.data.items); toast('Reset to default'); router.refresh() } }}>Reset to default</Button>}</form>}
    </div>
  )
}

function Ai({ company, spend, analyses, owner }: Props & { owner: boolean }) {
  const [cap, setCap] = useState(String(company.ai_monthly_cap_usd))
  const [mb, setMb] = useState(String(company.max_upload_mb))
  const router = useRouter()
  const { toast } = useToast()
  const pct = company.ai_monthly_cap_usd > 0 ? Math.min(100, (spend / company.ai_monthly_cap_usd) * 100) : 100
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>AI usage</h2>
      <div><div className="t-metric num">{fmtMoney(spend)}</div><div className="t-footnote" style={{ color: 'var(--label-secondary)' }}>spent this month of a {fmtMoney(company.ai_monthly_cap_usd)} cap. New analyses are blocked at the cap.</div>
        <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly AI budget used" style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', marginTop: 8, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? 'var(--red)' : 'var(--accent)' }} /></div></div>
      {owner && <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={async (e) => { e.preventDefault(); const r = await updateLimits({ ai_monthly_cap_usd: Number(cap), max_upload_mb: Number(mb) }); if (!r.ok) return toast(r.error, { error: true }); toast('Saved'); router.refresh() }}>
        <div><label className="field-label" htmlFor="cap">Monthly AI cap (USD)</label><input id="cap" className="input num" style={{ width: 140 }} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <div><label className="field-label" htmlFor="mb">Max upload size (MB)</label><input id="mb" className="input num" style={{ width: 140 }} inputMode="numeric" value={mb} onChange={(e) => setMb(e.target.value.replace(/\D/g, ''))} /></div><Button variant="primary" type="submit">Save</Button></form>}
      <table className="fp-table"><thead><tr>{['When', 'Kind', 'Model', 'Tokens in / out', 'Cache read', 'Cost', 'Citations rejected'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{analyses.map((a) => <tr key={a.id}><td>{timeAgo(a.created_at)}</td><td>{a.kind}{a.status === 'error' && <Badge tone="red">failed</Badge>}</td><td className="mono">{a.model}</td><td className="num">{a.input_tokens.toLocaleString()} / {a.output_tokens.toLocaleString()}</td><td className="num">{a.cache_read_tokens.toLocaleString()}</td><td className="num">${Number(a.cost_usd).toFixed(2)}</td><td className="num">{a.citation_rejections} / {a.citation_total}</td></tr>)}</tbody></table>
      {analyses.length === 0 && <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: 0 }}>No AI calls this month.</p>}
    </div>
  )
}

function Sync({ sync, owner, samConfigured }: Props & { owner: boolean }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>Data sync</h2>
      <p className="t-callout" style={{ margin: 0 }}>Last synced <strong>{timeAgo(sync.lastSyncedAt)}</strong> · {sync.callsLeft} of {sync.quota} SAM.gov calls left today · SAM key {samConfigured ? 'configured' : <strong style={{ color: 'var(--red)' }}>not set</strong>}</p>
      {sync.banner && <p role="status" className="card t-callout" style={{ padding: 12, margin: 0, background: 'var(--yellow-fill)', color: 'var(--yellow)' }}>{sync.banner.message} Next allowed {new Date(sync.banner.nextAllowedAt).toLocaleString()}.</p>}
      {owner && <div><Button variant="primary" disabled={busy || !samConfigured} onClick={async () => { setBusy(true); const r = await fetch('/api/sync/run', { method: 'POST' }); const j = await r.json().catch(() => ({})); setBusy(false); toast(!r.ok ? j.error ?? 'Sync failed' : j.status === 'quota_exhausted' ? 'Quota used up — try after the reset' : `Sync ${j.status}: ${j.inserted} new, ${j.updated} updated, ${j.callsUsed} calls`, { error: !r.ok }); router.refresh() }}>{busy ? 'Syncing…' : 'Sync now'}</Button><span className="t-footnote" style={{ color: 'var(--label-secondary)', marginLeft: 8 }}>The daily quota is set by SAM_DAILY_QUOTA on the server.</span></div>}
      <table className="fp-table"><thead><tr>{['Started', 'Kind', 'Status', 'Calls', 'Found', 'New', 'Updated', 'Next allowed'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{sync.runs.map((r) => <tr key={r.id}><td>{timeAgo(r.started_at)}</td><td>{r.purpose === 'sync' ? 'Scheduled' : 'On demand'}</td><td><Badge tone={r.status === 'complete' ? 'green' : r.status === 'error' ? 'red' : r.status === 'running' ? 'accent' : 'yellow'}>{r.status.replace('_', ' ')}</Badge></td><td className="num">{r.calls_used}</td><td className="num">{r.found}</td><td className="num">{r.inserted}</td><td className="num">{r.updated}</td><td>{r.next_allowed_at ? new Date(r.next_allowed_at).toLocaleString() : '—'}</td></tr>)}</tbody></table>
      {sync.runs.length === 0 && <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: 0 }}>No syncs yet.</p>}
    </div>
  )
}

function Audit({ audit }: Props) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2 className="t-title3" style={{ margin: 0 }}>Audit log</h2>
      <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>Who did what, and when. Entries can’t be edited or deleted.</p>
      <table className="fp-table"><thead><tr>{['When', 'Who', 'What'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{audit.map((a) => <tr key={a.id}><td title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</td><td>{a.actor}</td><td>{a.entity_type.replace(/_/g, ' ')} · {a.action.replace(/_/g, ' ')}</td></tr>)}</tbody></table>
    </div>
  )
}

'use client'
import { Check, X, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { createCompany, finishOnboarding, updateCompany } from '@/lib/actions/company'
import type { Company } from '@/lib/db-types'

const NAICS_HINT = '336413 Other aircraft parts · 332710 Machine shops · 541330 Engineering services · 423840 Industrial supplies wholesale'
const splitList = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{ok ? <Check size={16} color="var(--green)" aria-hidden /> : <X size={16} color="var(--red)" aria-hidden />}<span>{label}</span><span className="t-footnote" style={{ marginLeft: 'auto', color: 'var(--label-secondary)' }}>{ok ? 'Configured on the server' : 'Not set'}</span></li>
  )
}

export function Onboarding({ hasCompany, company, keys, role }: { hasCompany: boolean; company: Company | null; keys: { sam: boolean; anthropic: boolean; email: boolean }; role: string }) {
  const [step, setStep] = useState(hasCompany ? 2 : 1)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ name: company?.name ?? '', uei: company?.uei ?? '', cage: company?.cage ?? '', size: company?.business_size ?? '', naics: (company?.naics_codes ?? []).join(', '), caps: (company?.product_categories ?? []).join(', '), agencies: (company?.target_agencies ?? []).join(', ') })
  const [sync, setSync] = useState<{ state: 'idle' | 'running' | 'done' | 'error'; text?: string }>({ state: 'idle' })
  const router = useRouter()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const next1 = () => start(async () => {
    setError(null)
    const c = await createCompany({ name: f.name })
    if (!c.ok) return setError(c.error)
    const u = await updateCompany({ uei: f.uei.trim() || null, cage: f.cage.trim() || null, business_size: f.size.trim() || null })
    if (!u.ok) return setError(u.error)
    setStep(2)
  })
  const next2 = () => start(async () => {
    setError(null)
    const naics = splitList(f.naics)
    if (naics.length === 0) return setError('Add at least one NAICS code — it tells Fieldpoint which SAM.gov notices to pull.')
    const u = await updateCompany({ naics_codes: naics, primary_naics: naics[0], product_categories: splitList(f.caps), target_agencies: splitList(f.agencies) })
    if (!u.ok) return setError(u.error)
    setStep(3)
  })
  async function firstSync() {
    setSync({ state: 'running' })
    try {
      const r = await fetch('/api/sync/run', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) return setSync({ state: 'error', text: j.error ?? 'Sync failed' })
      const text = j.status === 'quota_exhausted' ? `SAM.gov’s quota is used up for today. Sync resumes after ${new Date(j.nextAllowedAt).toLocaleString()}.` : j.status === 'skipped' ? 'No NAICS codes are configured yet.' : `Pulled ${j.found} notices from SAM.gov, kept ${j.inserted} that match your profile, using ${j.callsUsed} API call${j.callsUsed === 1 ? '' : 's'}.${j.status === 'partial' ? ' More will arrive on the next scheduled sync.' : ''}`
      setSync({ state: j.status === 'error' ? 'error' : 'done', text: j.status === 'error' ? 'SAM.gov returned an error. Details are in Settings → Data sync.' : text })
    } catch { setSync({ state: 'error', text: 'Could not reach the server.' }) }
  }
  const finish = () => start(async () => { await finishOnboarding(); router.push('/dashboard'); router.refresh() })



  return (
    <div className="card anim-sheet" style={{ padding: 32 }}>
      <p className="t-caption" style={{ margin: 0, color: 'var(--label-secondary)' }}>Step {step} of 3</p>
      {step === 1 && (<>
        <h1 className="t-title1" style={{ margin: '4px 0 4px' }}>Your company</h1>
        <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: '0 0 24px' }}>The basics. You can refine everything later in Company profile.</p>
        <div style={{ display: 'grid', gap: 16 }}>
          <div><label className="field-label" htmlFor="name">Company name</label><input id="name" className="input" value={f.name} onChange={set('name')} autoFocus /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div><label className="field-label" htmlFor="uei">UEI</label><input id="uei" className="input mono" value={f.uei} onChange={set('uei')} maxLength={12} /></div>
            <div><label className="field-label" htmlFor="cage">CAGE code</label><input id="cage" className="input mono" value={f.cage} onChange={set('cage')} maxLength={5} /></div>
          </div>
          <div><label className="field-label" htmlFor="size">Business size / status</label><input id="size" className="input" value={f.size} onChange={set('size')} placeholder="e.g. Small business, SDVOSB" /></div>
        </div>
      </>)}
      {step === 2 && (<>
        <h1 className="t-title1" style={{ margin: '4px 0 4px' }}>What you pursue</h1>
        <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: '0 0 24px' }}>NAICS codes decide which SAM.gov notices are stored. Capabilities help the AI judge fit.</p>
        <div style={{ display: 'grid', gap: 16 }}>
          <div><label className="field-label" htmlFor="naics">NAICS codes (comma separated)</label><input id="naics" className="input mono" value={f.naics} onChange={set('naics')} placeholder="336413, 332710" /><p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '4px 0 0' }}>Examples: {NAICS_HINT}</p></div>
          <div><label className="field-label" htmlFor="caps">Products / capabilities</label><textarea id="caps" className="textarea" rows={3} value={f.caps} onChange={set('caps')} placeholder="Hydraulic components, machined parts, installation services" /></div>
          <div><label className="field-label" htmlFor="ag">Target agencies (optional)</label><input id="ag" className="input" value={f.agencies} onChange={set('agencies')} placeholder="Defense, Army, Navy — leave blank for all" /></div>
        </div>
      </>)}
      {step === 3 && (<>
        <h1 className="t-title1" style={{ margin: '4px 0 4px' }}>Data connections</h1>
        <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: '0 0 16px' }}>API keys live in server environment variables. Fieldpoint never asks for them here — and never for a SAM.gov password.</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 12 }}>
          <Status ok={keys.sam} label="SAM.gov public API key" /><Status ok={keys.anthropic} label="Anthropic API key (AI analysis)" /><Status ok={keys.email} label="Resend API key (email digests)" />
        </ul>
        {!keys.sam && <p role="alert" className="t-callout" style={{ color: 'var(--red)' }}>Set SAM_API_KEY on the server (see README), then return here. You can still finish setup.</p>}
        {role === 'owner' && sync.state === 'idle' && <Button variant="primary" onClick={firstSync} disabled={!keys.sam}>Run first sync</Button>}
        {sync.state === 'running' && <p className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center' }} role="status"><Loader2 size={16} className="spin" aria-hidden /> Contacting SAM.gov… this can take a minute.</p>}
        {(sync.state === 'done' || sync.state === 'error') && <p role="status" className="t-callout" style={{ color: sync.state === 'error' ? 'var(--red)' : undefined }}>{sync.text}</p>}
      </>)}
      {error && <p role="alert" className="t-callout" style={{ color: 'var(--red)', marginTop: 16 }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
        {step > 1 && !(hasCompany && step === 2) ? <Button variant="plain" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        {step === 1 && <Button variant="primary" disabled={pending || !f.name.trim()} onClick={next1}>Continue</Button>}
        {step === 2 && <Button variant="primary" disabled={pending} onClick={next2}>Continue</Button>}
        {step === 3 && <Button variant="primary" disabled={pending || sync.state === 'running'} onClick={finish}>{sync.state === 'done' ? 'Open dashboard' : 'Finish'}</Button>}
      </div>
    </div>
  )
}

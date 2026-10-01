'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, type UseFormRegister } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { updateCompany } from '@/lib/actions/company'
import type { Company } from '@/lib/db-types'
import { CompanySchema } from '@/lib/schemas'

const tri = z.enum(['', 'yes', 'no'])
const Form = z.object({
  name: z.string().trim().min(1, 'Required'), uei: z.string().max(20), cage: z.string().max(10), sam_status: z.enum(['', 'active', 'inactive', 'expired', 'not_registered']), sam_expiration: z.string(),
  business_size: z.string(), small_business_status: z.string(), certifications: z.string(), naics_codes: z.string(), primary_naics: z.string(), industries: z.string(), product_categories: z.string(), service_categories: z.string(),
  can_subcontract: tri, can_source_products: tri, logistics: z.string(), installation: z.string(), other_capabilities: z.string(), geographic_coverage: z.string(), target_agencies: z.string(),
  min_contract_size: z.string(), max_contract_size: z.string(), min_gross_margin: z.string(), cmmc_level: z.enum(['', 'none', 'level1', 'level2', 'level3']), cmmc_date: z.string(), sprs_score: z.string(), sprs_date: z.string(),
  facility_clearance: z.string(), itar_registered: tri, jcp_certified: tri,
})
type F = z.infer<typeof Form>
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
const nul = (s: string) => (s.trim() === '' ? null : s.trim())
const n = (s: string) => (s.trim() === '' ? null : Number(s))
const t = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null)
const fromT = (v: boolean | null) => (v === true ? 'yes' : v === false ? 'no' : '')
const SECTIONS = [['identity', 'Identity & SAM'], ['capabilities', 'NAICS & capabilities'], ['contracts', 'Contract size & margin'], ['compliance', 'Defense compliance']] as const

function TriSelect({ id, label, register }: { id: keyof F; label: string; register: UseFormRegister<F> }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label><select id={id} className="select" {...register(id)}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></div>
}

export function CompanyForm({ c, canEdit }: { c: Company; canEdit: boolean }) {
  const [section, setSection] = useState<(typeof SECTIONS)[number][0]>('identity')
  const router = useRouter()
  const { toast } = useToast()
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<F>({
    resolver: zodResolver(Form),
    defaultValues: { name: c.name, uei: c.uei ?? '', cage: c.cage ?? '', sam_status: (c.sam_status as F['sam_status']) ?? '', sam_expiration: c.sam_expiration ?? '', business_size: c.business_size ?? '', small_business_status: c.small_business_status ?? '', certifications: c.certifications.join(', '), naics_codes: c.naics_codes.join(', '), primary_naics: c.primary_naics ?? '', industries: c.industries.join(', '), product_categories: c.product_categories.join(', '), service_categories: c.service_categories.join(', '), can_subcontract: fromT(c.can_subcontract) as F['can_subcontract'], can_source_products: fromT(c.can_source_products) as F['can_source_products'], logistics: c.logistics ?? '', installation: c.installation ?? '', other_capabilities: c.other_capabilities ?? '', geographic_coverage: c.geographic_coverage ?? '', target_agencies: c.target_agencies.join(', '), min_contract_size: c.min_contract_size?.toString() ?? '', max_contract_size: c.max_contract_size?.toString() ?? '', min_gross_margin: c.min_gross_margin != null ? String(c.min_gross_margin * 100) : '', cmmc_level: (c.cmmc_level as F['cmmc_level']) ?? '', cmmc_date: c.cmmc_date ?? '', sprs_score: c.sprs_score?.toString() ?? '', sprs_date: c.sprs_date ?? '', facility_clearance: c.facility_clearance ?? '', itar_registered: fromT(c.itar_registered) as F['itar_registered'], jcp_certified: fromT(c.jcp_certified) as F['jcp_certified'] },
  })
  const submit = async (v: F) => {
    const parsed = CompanySchema.safeParse({ name: v.name, uei: nul(v.uei), cage: nul(v.cage), sam_status: v.sam_status || null, sam_expiration: nul(v.sam_expiration), naics_codes: list(v.naics_codes), primary_naics: nul(v.primary_naics), business_size: nul(v.business_size), small_business_status: nul(v.small_business_status), certifications: list(v.certifications), geographic_coverage: nul(v.geographic_coverage), industries: list(v.industries), product_categories: list(v.product_categories), service_categories: list(v.service_categories), min_contract_size: n(v.min_contract_size), max_contract_size: n(v.max_contract_size), min_gross_margin: v.min_gross_margin.trim() === '' ? null : Number(v.min_gross_margin) / 100, can_subcontract: t(v.can_subcontract), can_source_products: t(v.can_source_products), logistics: nul(v.logistics), installation: nul(v.installation), other_capabilities: nul(v.other_capabilities), cmmc_level: v.cmmc_level || null, cmmc_date: nul(v.cmmc_date), sprs_score: n(v.sprs_score), sprs_date: nul(v.sprs_date), facility_clearance: nul(v.facility_clearance), itar_registered: t(v.itar_registered), jcp_certified: t(v.jcp_certified), target_agencies: list(v.target_agencies) })
    if (!parsed.success) return toast(parsed.error.issues[0].path.join('.') + ': ' + parsed.error.issues[0].message, { error: true })
    const r = await updateCompany(parsed.data)
    if (!r.ok) return toast(r.error, { error: true })
    toast('Profile saved'); router.refresh()
  }
  const L = (id: keyof F, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <div><label className="field-label" htmlFor={id}>{label}</label><input id={id} className="input" {...props} {...register(id)} />{(errors as Record<string, { message?: string }>)[id]?.message && <p className="field-error" role="alert">{(errors as Record<string, { message?: string }>)[id]?.message}</p>}{hint && <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '4px 0 0' }}>{hint}</p>}</div>
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 } as const
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) 1fr', gap: 24, alignItems: 'start' }} className="fp-settings">
      <nav aria-label="Profile sections" style={{ display: 'grid', gap: 2 }}>{SECTIONS.map(([k, l]) => <button key={k} type="button" className="side-item" aria-current={section === k ? 'page' : undefined} onClick={() => setSection(k)} style={{ background: 'none', border: 0, textAlign: 'left', height: 32 }}>{l}</button>)}</nav>
      <form onSubmit={handleSubmit(submit, (errs) => { const [k, e] = Object.entries(errs)[0] ?? ['form', { message: 'Check the form' }]; toast(`${k.replace(/_/g, ' ')}: ${(e as { message?: string }).message ?? 'invalid'}`, { error: true }) })} noValidate className="card" style={{ padding: 24, display: 'grid', gap: 16 }}>
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
          {section === 'identity' && <><h2 className="t-title3" style={{ margin: 0 }}>Identity & SAM</h2>{L('name', 'Company name')}<div style={grid}>{L('uei', 'UEI', undefined, { className: 'input mono' })}{L('cage', 'CAGE code', undefined, { className: 'input mono' })}</div><div style={grid}><div><label className="field-label" htmlFor="sam_status">SAM registration status</label><select id="sam_status" className="select" {...register('sam_status')}><option value="">Unknown</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="expired">Expired</option><option value="not_registered">Not registered</option></select></div>{L('sam_expiration', 'SAM expiration date', 'Compared with each offer deadline in the checklist.', { type: 'date' })}</div><div style={grid}>{L('business_size', 'Business size')}{L('small_business_status', 'Small-business status / set-aside eligibility', 'e.g. SDVOSB, 8(a), HUBZone, WOSB')}</div>{L('certifications', 'Certifications (comma separated)', 'ISO 9001, AS9100, ...')}</>}
          {section === 'capabilities' && <><h2 className="t-title3" style={{ margin: 0 }}>NAICS & capabilities</h2><div style={grid}>{L('naics_codes', 'NAICS codes (comma separated)', 'Controls which SAM.gov notices are synced.', { className: 'input mono' })}{L('primary_naics', 'Primary NAICS', undefined, { className: 'input mono' })}</div>{L('target_agencies', 'Target agencies (optional)', 'Blank = all agencies. Matches the notice’s agency path.')}<div style={grid}>{L('industries', 'Industries')}{L('product_categories', 'Product categories')}{L('service_categories', 'Service categories')}</div><div style={grid}><TriSelect id="can_subcontract" label="Can subcontract" register={register} /><TriSelect id="can_source_products" label="Can source products" register={register} /></div>{L('geographic_coverage', 'Geographic coverage')}{L('logistics', 'Logistics capability')}{L('installation', 'Installation capability')}<div><label className="field-label" htmlFor="other_capabilities">Other capabilities</label><textarea id="other_capabilities" className="textarea" rows={3} {...register('other_capabilities')} /></div></>}
          {section === 'contracts' && <><h2 className="t-title3" style={{ margin: 0 }}>Contract size & margin</h2><div style={grid}>{L('min_contract_size', 'Minimum contract size ($)', undefined, { inputMode: 'numeric' })}{L('max_contract_size', 'Maximum contract size ($)', undefined, { inputMode: 'numeric' })}{L('min_gross_margin', 'Minimum gross margin (%)', 'The pricing calculator warns when a scenario falls below this.', { inputMode: 'decimal' })}</div></>}
          {section === 'compliance' && <><h2 className="t-title3" style={{ margin: 0 }}>Defense compliance</h2><div style={grid}><div><label className="field-label" htmlFor="cmmc_level">CMMC level</label><select id="cmmc_level" className="select" {...register('cmmc_level')}><option value="">Unknown</option><option value="none">None</option><option value="level1">Level 1</option><option value="level2">Level 2</option><option value="level3">Level 3</option></select></div>{L('cmmc_date', 'CMMC assessment date', undefined, { type: 'date' })}{L('sprs_score', 'SPRS score', 'From −203 to 110.', { inputMode: 'numeric' })}{L('sprs_date', 'SPRS score date', undefined, { type: 'date' })}</div>{L('facility_clearance', 'Facility clearance')}<div style={grid}><TriSelect id="itar_registered" label="ITAR registered" register={register} /><TriSelect id="jcp_certified" label="JCP certified" register={register} /></div></>}
        </fieldset>
        {canEdit ? <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>{isDirty && <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>Unsaved changes</span>}<Button variant="primary" type="submit" disabled={isSubmitting || !isDirty}>Save profile</Button></div> : <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: 0 }}>Only owners can edit the company profile.</p>}
      </form>
    </div>
  )
}

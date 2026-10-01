'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { saveSupplier } from '@/lib/actions/suppliers'
import { SupplierSchema } from '@/lib/schemas'

/** Form model uses comma-separated text for list fields; converted to the shared server schema on submit. */
const FormSchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(200), website: z.string().max(300), contactName: z.string().max(200), contactEmail: z.string().max(200).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Enter a valid email'), contactPhone: z.string().max(60), categories: z.string(), products: z.string(), status: z.enum(['', 'manufacturer', 'authorized_distributor', 'reseller']), lead: z.string().regex(/^\d*$/, 'Whole days only'), certifications: z.string(), origin: z.string().max(100), coverage: z.string().max(500), notes: z.string().max(5000) })
type F = z.infer<typeof FormSchema>
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
export type SupplierRow = { id?: string; name: string; website: string | null; contact: { name?: string; email?: string; phone?: string }; categories: string[]; products: string[]; status: string | null; lead_time_days: number | null; certifications: string[]; country_of_origin: string | null; coverage: string | null; notes: string | null }

function Field({ id, label, err, children }: { id: string; label: string; err?: string; children: React.ReactNode }) {
  return <div><label className="field-label" htmlFor={id}>{label}</label>{children}{err && <p className="field-error" role="alert">{err}</p>}</div>
}

export function SupplierForm({ s, onDone }: { s?: SupplierRow; onDone: (id: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(FormSchema), defaultValues: { name: s?.name ?? '', website: s?.website ?? '', contactName: s?.contact?.name ?? '', contactEmail: s?.contact?.email ?? '', contactPhone: s?.contact?.phone ?? '', categories: (s?.categories ?? []).join(', '), products: (s?.products ?? []).join(', '), status: (s?.status as F['status']) ?? '', lead: s?.lead_time_days != null ? String(s.lead_time_days) : '', certifications: (s?.certifications ?? []).join(', '), origin: s?.country_of_origin ?? '', coverage: s?.coverage ?? '', notes: s?.notes ?? '' } })
  const { toast } = useToast()
  const router = useRouter()
  const submit = async (v: F) => {
    const data = SupplierSchema.parse({ name: v.name, website: v.website, contact: { name: v.contactName || undefined, email: v.contactEmail || undefined, phone: v.contactPhone || undefined }, categories: list(v.categories), products: list(v.products), status: v.status || null, lead_time_days: v.lead ? Number(v.lead) : null, certifications: list(v.certifications), country_of_origin: v.origin || null, coverage: v.coverage || null, notes: v.notes || null })
    const r = await saveSupplier({ id: s?.id, data })
    if (!r.ok) return toast(r.error, { error: true })
    toast('Supplier saved'); router.refresh(); onDone(r.data.id)
  }
  return (
    <form onSubmit={handleSubmit(submit)} noValidate style={{ display: 'grid', gap: 12 }}>
      <Field id="sn" label="Company name" err={errors.name?.message}><input id="sn" className="input" aria-invalid={!!errors.name} {...register('name')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field id="sw" label="Website"><input id="sw" className="input" {...register('website')} /></Field>
        <Field id="ss" label="Status"><select id="ss" className="select" {...register('status')}><option value="">Unknown</option><option value="manufacturer">Manufacturer</option><option value="authorized_distributor">Authorized distributor</option><option value="reseller">Reseller</option></select></Field>
        <Field id="sc" label="Contact name"><input id="sc" className="input" {...register('contactName')} /></Field>
        <Field id="se" label="Contact email" err={errors.contactEmail?.message}><input id="se" className="input" type="email" {...register('contactEmail')} /></Field>
        <Field id="sp" label="Contact phone"><input id="sp" className="input" {...register('contactPhone')} /></Field>
        <Field id="sl" label="Typical lead time (days)" err={errors.lead?.message}><input id="sl" className="input num" inputMode="numeric" {...register('lead')} /></Field>
      </div>
      <Field id="scat" label="Product categories (comma separated)"><input id="scat" className="input" {...register('categories')} /></Field>
      <Field id="spr" label="Products / part numbers (comma separated)"><input id="spr" className="input mono" {...register('products')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field id="scert" label="Certifications"><input id="scert" className="input" placeholder="ISO 9001, AS9100" {...register('certifications')} /></Field>
        <Field id="so" label="Country of origin capability"><input id="so" className="input" placeholder="USA (Berry / TAA compliant)" {...register('origin')} /></Field>
      </div>
      <Field id="scov" label="Geographic coverage"><input id="scov" className="input" {...register('coverage')} /></Field>
      <Field id="sno" label="Notes"><textarea id="sno" className="textarea" rows={3} {...register('notes')} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" type="submit" disabled={isSubmitting}>{s?.id ? 'Save changes' : 'Add supplier'}</Button></div>
    </form>
  )
}

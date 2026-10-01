import { Truck } from 'lucide-react'
import type { Metadata } from 'next'
import { SuppliersView } from '@/components/app/SuppliersView'
import { Empty, PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Suppliers' }
export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  const s = await requirePageSession()
  if (s.role === 'viewer') return (<><PageHeader title="Suppliers" /><Empty icon={Truck} title="Supplier data isn’t available to viewers" body="Ask an owner to change your role if you need sourcing and pricing access." /></>)
  const [{ data: sup }, { data: quotes }] = await Promise.all([s.supabase.from('suppliers').select('*').order('name'), s.supabase.from('supplier_quotes').select('supplier_id, quote_date').order('quote_date', { ascending: false })])
  const last = new Map<string, string>()
  for (const q of quotes ?? []) if (!last.has(q.supplier_id)) last.set(q.supplier_id, q.quote_date)
  const rows = (sup ?? []).map((r: any) => ({ ...r, lastQuote: last.get(r.id) ?? null }))
  return (<><PageHeader title="Suppliers" subtitle="Supplier data stays inside your company. It is never sent to the government or any third party." /><SuppliersView rows={rows} canWrite /></>)
}

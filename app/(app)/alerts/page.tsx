import type { Metadata } from 'next'
import { AlertsView, type AlertRow } from '@/components/app/AlertsView'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Alerts' }
export const dynamic = 'force-dynamic'

export default async function AlertsPage() {
  const s = await requirePageSession()
  const { data } = await s.supabase.from('alerts').select('id, type, title, opportunity_id, link_tab, created_at, read_at').order('created_at', { ascending: false }).limit(300)
  return (<><PageHeader title="Alerts" subtitle="In-app alerts are always on. Email is optional and set per type in Preferences." /><AlertsView rows={(data ?? []) as AlertRow[]} /></>)
}

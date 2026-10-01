import type { Metadata } from 'next'
import Link from 'next/link'
import { PrefsForm } from '@/components/app/PrefsForm'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Alert preferences' }
export const dynamic = 'force-dynamic'

export default async function PrefsPage() {
  const s = await requirePageSession()
  const { data } = await s.supabase.from('alert_preferences').select('type, in_app, email, digest, deadline_offsets')
  return (<><PageHeader title="Alert preferences" subtitle={<><Link href="/alerts">← Alerts</Link></>} /><PrefsForm initial={data ?? []} emailConfigured={!!process.env.RESEND_API_KEY} /></>)
}

import type { Metadata } from 'next'
import { CompanyForm } from '@/components/app/CompanyForm'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Company profile' }
export const dynamic = 'force-dynamic'

export default async function CompanyPage() {
  const s = await requirePageSession()
  return (<><PageHeader title="Company profile" subtitle="Used for fit judgements and checklist suggestions. Never shared with the government." /><CompanyForm c={s.company} canEdit={s.role === 'owner'} /></>)
}

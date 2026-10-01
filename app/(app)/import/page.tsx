import type { Metadata } from 'next'
import { DibbsImport } from '@/components/app/DibbsImport'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Import DIBBS RFQ' }

export default async function ImportPage() {
  const s = await requirePageSession()
  return (<><PageHeader title="Import DIBBS RFQ" subtitle="DIBBS has no public API. Fieldpoint doesn’t scrape it or sign in for you — upload an RFQ you downloaded, or paste its text." /><DibbsImport canWrite={s.role !== 'viewer'} /></>)
}

'use client'
import { useRouter } from 'next/navigation'
import { ensureWorkspace } from '@/lib/actions/opportunities'
import type { DetailData } from '@/lib/data/detail'

/** Returns the company_opportunity id, creating the company's workspace row for this notice on first use. */
export function useCo(d: DetailData) {
  const router = useRouter()
  return async (): Promise<string | null> => {
    if (d.co) return d.co.id
    const r = await ensureWorkspace({ opportunityId: d.opp.id })
    if (!r.ok) return null
    router.refresh()
    return r.data.coId
  }
}

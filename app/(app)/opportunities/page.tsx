import type { Metadata } from 'next'
import { OpportunitiesView } from '@/components/app/OpportunitiesView'
import { PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'
import { sidebarCounts } from '@/lib/data/dashboard'
import { queryOpportunities } from '@/lib/data/opportunities'
import { FiltersSchema } from '@/lib/search'

export const metadata: Metadata = { title: 'Opportunities' }
export const dynamic = 'force-dynamic'

export default async function OpportunitiesPage({ searchParams }: PageProps<'/opportunities'>) {
  const s = await requirePageSession()
  const sp = await searchParams
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined))
  let extra = {}
  try { if (one('f')) extra = JSON.parse(one('f')!) } catch { /* ignore a malformed shared link */ }
  const parsed = FiltersSchema.safeParse({ ...extra, tab: one('tab') ?? (one('saved') ? 'all' : 'bid_ready') })
  const filters = parsed.success ? parsed.data : FiltersSchema.parse({ tab: 'bid_ready' })
  const savedOnly = one('saved') === '1'
  const [initial, counts, prof] = await Promise.all([
    queryOpportunities(s, filters, { savedOnly }), sidebarCounts(s),
    s.supabase.from('profiles').select('preferences').eq('user_id', s.user.id).maybeSingle(),
  ])
  return (
    <>
      <PageHeader title={savedOnly ? 'Saved opportunities' : 'Opportunities'} subtitle="Stored notices from SAM.gov and imported DIBBS RFQs. Colour labels follow fixed rules — green means “bid-type notice”, not “we’re eligible”." />
      <OpportunitiesView initial={initial} filters={filters} savedOnly={savedOnly} role={s.role} prefs={prof.data?.preferences ?? {}} counts={counts} />
    </>
  )
}

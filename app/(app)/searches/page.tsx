import { Bookmark } from 'lucide-react'
import type { Metadata } from 'next'
import { SearchesView } from '@/components/app/SearchesView'
import { Empty, PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'
import { FiltersSchema, filterChips } from '@/lib/search'

export const metadata: Metadata = { title: 'Saved searches' }
export const dynamic = 'force-dynamic'

export default async function SearchesPage() {
  const s = await requirePageSession()
  const { data } = await s.supabase.from('saved_searches').select('id, name, filters, alerts_enabled, created_at').order('created_at', { ascending: false })
  const rows = (data ?? []).map((r: any) => { const f = FiltersSchema.safeParse(r.filters); const filters = f.success ? f.data : FiltersSchema.parse({}); return { id: r.id as string, name: r.name as string, alerts: r.alerts_enabled as boolean, href: `/opportunities?${new URLSearchParams({ tab: filters.tab, f: JSON.stringify((({ tab: _t, ...rest }) => rest)(filters)) })}`, chips: filterChips(filters).map((c) => `${c.label}: ${c.value}`) } })
  return (<><PageHeader title="Saved searches" subtitle="Alert-enabled searches run against new notices after every sync." />{rows.length === 0 ? <Empty icon={Bookmark} title="No saved searches" body="Set filters on the Opportunities page and choose Save search." /> : <SearchesView rows={rows} />}</>)
}

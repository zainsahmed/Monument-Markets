import { Suspense } from 'react'
import { Shell } from '@/components/app/Shell'
import { Providers } from '@/components/app/Providers'
import { requirePageSession } from '@/lib/auth'
import { sidebarCounts } from '@/lib/data/dashboard'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const s = await requirePageSession()
  const counts = await sidebarCounts(s)
  return (
    <Providers>
      <Shell counts={counts} user={s.user} role={s.role}>
        <Suspense>{children}</Suspense>
      </Shell>
    </Providers>
  )
}

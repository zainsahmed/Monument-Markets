import { handle, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { getEnv } from '@/lib/env'
import { createSamClient } from '@/lib/sam/client'
import { createSupabaseSyncStore } from '@/lib/sam/store'
import { runSamSync } from '@/lib/sam/sync'
import { createAdminClient } from '@/lib/supabase/admin'
import { savedSearchSweep } from '@/lib/alerts-db'

export const maxDuration = 300

/** Owner-triggered sync (onboarding "first sync" and Settings → "Sync now"). Same quota-aware code path as the cron job. */
export async function POST() {
  return handle(async () => {
    const session = await requireApiSession('owner')
    const { data: ok } = await session.supabase.rpc('check_rate_limit', { p_bucket: 'sync', p_max: 6, p_window_seconds: 3600 })
    if (!ok) return json({ error: 'Sync was started too many times recently.' }, 429)
    const env = getEnv()
    const admin = createAdminClient()
    const r = await runSamSync(createSamClient(), createSupabaseSyncStore(admin), { dailyQuota: env.SAM_DAILY_QUOTA, reserved: env.SAM_RESERVED_CALLS })
    if (r.inserted > 0) await savedSearchSweep(admin)
    return json({ ...r, nextAllowedAt: r.nextAllowedAt?.toISOString() ?? null })
  })
}

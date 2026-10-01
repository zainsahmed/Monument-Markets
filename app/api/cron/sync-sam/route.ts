import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron'
import { getEnv } from '@/lib/env'
import { createSamClient } from '@/lib/sam/client'
import { createSupabaseSyncStore } from '@/lib/sam/store'
import { runSamSync } from '@/lib/sam/sync'
import { createAdminClient } from '@/lib/supabase/admin'
import { savedSearchSweep } from '@/lib/alerts-db'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Vercel Cron issues GET; manual triggers may POST. Both require CRON_SECRET.
async function handle(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied
  const env = getEnv()
  const admin = createAdminClient()
  const result = await runSamSync(createSamClient(), createSupabaseSyncStore(admin), { dailyQuota: env.SAM_DAILY_QUOTA, reserved: env.SAM_RESERVED_CALLS })
  const newMatches = result.inserted > 0 ? await savedSearchSweep(admin) : 0
  return NextResponse.json({ ...result, nextAllowedAt: result.nextAllowedAt?.toISOString() ?? null, newMatchAlerts: newMatches })
}
export const GET = handle
export const POST = handle

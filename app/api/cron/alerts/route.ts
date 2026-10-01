import { NextResponse } from 'next/server'
import { verifyCron } from '@/lib/cron'
import { createAdminClient } from '@/lib/supabase/admin'
import { deadlineSweep, quoteExpirySweep, savedSearchSweep } from '@/lib/alerts-db'
import { emailSweep } from '@/lib/email'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/** Schedule hourly. The first run after 12:00 UTC each day also sends digest emails (?digest=1 forces it). */
async function handle(req: Request) {
  const denied = verifyCron(req)
  if (denied) return denied
  const admin = createAdminClient()
  const url = new URL(req.url)
  const digestRun = url.searchParams.get('digest') === '1' || new Date().getUTCHours() === 12
  const [deadlines, quotes, matches] = [await deadlineSweep(admin), await quoteExpirySweep(admin), await savedSearchSweep(admin)]
  const email = await emailSweep(admin, { digestRun })
  await admin.from('rate_limit_events').delete().lt('created_at', new Date(Date.now() - 2 * 864e5).toISOString())
  await admin.rpc('refresh_color_labels')
  return NextResponse.json({ deadlines, quotes, matches, email, digestRun })
}
export const GET = handle
export const POST = handle

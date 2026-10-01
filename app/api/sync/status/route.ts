import { handle, json } from '@/lib/api'
import { requireApiSession } from '@/lib/auth'
import { syncStatus } from '@/lib/data/dashboard'

export const dynamic = 'force-dynamic'
export async function GET() {
  return handle(async () => json(await syncStatus(await requireApiSession('viewer'))))
}

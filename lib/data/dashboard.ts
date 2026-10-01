import 'server-only'
import type { Session } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEnv } from '@/lib/env'
import { samCallsUsedToday } from '@/lib/sam/store'
import { nextQuotaReset } from '@/lib/sam/plan'

export async function sidebarCounts(s: Session) {
  const head = (label: string) => s.supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('color_label', label)
  const [g, y, r, saved, unread] = await Promise.all([
    head('GREEN'), head('YELLOW'), head('RED'),
    s.supabase.from('company_opportunities').select('id', { count: 'exact', head: true }).eq('saved', true),
    s.supabase.from('alerts').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  return { bidReady: g.count ?? 0, watch: y.count ?? 0, awarded: r.count ?? 0, saved: saved.count ?? 0, unread: unread.count ?? 0 }
}

export interface SyncStatus {
  lastSyncedAt: string | null
  callsUsedToday: number
  quota: number
  callsLeft: number
  banner: { message: string; nextAllowedAt: string } | null
  lastError: string | null
  runs: Array<{ id: string; started_at: string; finished_at: string | null; purpose: string; calls_used: number; found: number; inserted: number; updated: number; status: string; errors: unknown[]; next_allowed_at: string | null }>
}

/** Last sync + quota. Quota exhaustion shows as a banner; the app stays fully usable on stored data. */
export async function syncStatus(s: Session, now = new Date()): Promise<SyncStatus> {
  const env = getEnv()
  const admin = createAdminClient()
  const used = await samCallsUsedToday(admin, now)
  const { data: runs } = await s.supabase.from('sync_runs').select('id, started_at, finished_at, purpose, calls_used, found, inserted, updated, status, errors, next_allowed_at').eq('source', 'SAM').order('started_at', { ascending: false }).limit(20)
  const last = (runs ?? []).find((r) => r.purpose === 'sync' && (r.status === 'complete' || r.status === 'partial'))
  const latest = (runs ?? []).find((r) => r.purpose === 'sync')
  const exhausted = used >= env.SAM_DAILY_QUOTA - env.SAM_RESERVED_CALLS
  const quotaRun = latest?.status === 'quota_exhausted' && latest.next_allowed_at && new Date(latest.next_allowed_at) > now ? latest : null
  const banner = quotaRun ? { message: 'SAM.gov’s daily quota is used up.', nextAllowedAt: quotaRun.next_allowed_at as string } : exhausted ? { message: 'Today’s SAM.gov call budget is used up (some calls are held back for on-demand fetches).', nextAllowedAt: nextQuotaReset(now).toISOString() } : null
  const err = latest?.status === 'error' ? ((latest.errors as Array<{ message?: string }>)?.[0]?.message ?? 'The last sync failed.') : null
  return { lastSyncedAt: last?.finished_at ?? last?.started_at ?? null, callsUsedToday: used, quota: env.SAM_DAILY_QUOTA, callsLeft: Math.max(0, env.SAM_DAILY_QUOTA - used), banner, lastError: err, runs: (runs ?? []) as SyncStatus['runs'] }
}

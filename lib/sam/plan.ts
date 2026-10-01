/** Pure planning helpers for the quota-aware sync (spec §5.1). */

export const SAM_MAX_LIMIT = 1000

export interface Budget {
  dailyQuota: number
  reserved: number
  usedToday: number
}

/** Calls the scheduled sync may spend today (on-demand reserve is never touched). */
export function availableSyncCalls(b: Budget): number {
  return Math.max(0, b.dailyQuota - b.reserved - b.usedToday)
}
/** Calls an on-demand fetch (description/attachment/refresh) may spend: whatever is left of the day. */
export function availableOnDemandCalls(b: Budget): number {
  return Math.max(0, b.dailyQuota - b.usedToday)
}

export interface Window { from: Date; to: Date }

/**
 * Pull everything posted since the last successful sync, minus an overlap to catch late posts.
 * SAM caps a window at 1 year.
 */
export function planWindow(opts: { lastSuccessfulSyncAt: Date | null; now: Date; overlapDays?: number; firstSyncDays?: number }): Window {
  const overlap = opts.overlapDays ?? 2
  const first = opts.firstSyncDays ?? 14
  const DAY = 86_400_000
  const to = new Date(Date.UTC(opts.now.getUTCFullYear(), opts.now.getUTCMonth(), opts.now.getUTCDate()))
  let from = opts.lastSuccessfulSyncAt
    ? new Date(Date.UTC(opts.lastSuccessfulSyncAt.getUTCFullYear(), opts.lastSuccessfulSyncAt.getUTCMonth(), opts.lastSuccessfulSyncAt.getUTCDate()) - overlap * DAY)
    : new Date(to.getTime() - first * DAY)
  const maxFrom = new Date(to.getTime() - 364 * DAY)
  if (from < maxFrom) from = maxFrom
  return { from, to }
}

export type SyncMode = 'per_naics' | 'sweep'
export interface Task { ncode: string | null; page: number }

/**
 * `ncode` accepts a single value, so filtering by N NAICS codes costs N calls. When those fit the
 * budget we query each code; otherwise we sweep the whole window (1,000 per call) and filter
 * locally. Either way the queue is resumable across days.
 */
export function planTasks(naics: string[], available: number): { mode: SyncMode; tasks: Task[] } {
  const codes = [...new Set(naics.map((n) => n.trim()).filter(Boolean))]
  if (codes.length > 0 && codes.length <= available) return { mode: 'per_naics', tasks: codes.map((ncode) => ({ ncode, page: 0 })) }
  return { mode: 'sweep', tasks: [{ ncode: null, page: 0 }] }
}

/** UTC midnight following `now` — SAM quotas reset daily. */
export function nextQuotaReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}
export const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

/** Does notice NAICS match the wanted set? Prefix match lets "3364" style entries work too. */
export function matchesNaics(naics: string | null, wanted: string[]): boolean {
  if (wanted.length === 0) return true
  if (!naics) return false
  return wanted.some((w) => naics === w || naics.startsWith(w))
}
export function matchesAgency(path: string | null, targets: string[]): boolean {
  if (targets.length === 0) return true
  if (!path) return false
  const p = path.toLowerCase()
  return targets.some((t) => p.includes(t.toLowerCase()))
}

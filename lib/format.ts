/** Shared display helpers. Missing data is ALWAYS "Unknown" — never blank, never guessed. */
export const UNKNOWN = 'Unknown'
export const orUnknown = (v: string | number | null | undefined): string => (v === null || v === undefined || v === '' ? UNKNOWN : String(v))

export const DAY_MS = 86_400_000
/** Whole days until a deadline, rounded up (a deadline later today = 1 day left). Negative = past. null = no deadline. */
export function daysLeft(deadline: string | Date | null | undefined, now = new Date()): number | null {
  if (!deadline) return null
  const t = new Date(deadline).getTime()
  if (Number.isNaN(t)) return null
  const diff = t - now.getTime()
  return diff <= 0 ? Math.floor(diff / DAY_MS) : Math.ceil(diff / DAY_MS)
}
export type CountdownTone = 'neutral' | 'yellow' | 'red' | 'past' | 'none'
/** neutral > 14 days, yellow 4–14, red ≤ 3, struck-through gray when past (spec §3.6). */
export function countdownTone(days: number | null): CountdownTone {
  if (days === null) return 'none'
  if (days < 0 || (days === 0)) return 'past'
  if (days <= 3) return 'red'
  if (days <= 14) return 'yellow'
  return 'neutral'
}
export function countdownText(days: number | null): string {
  if (days === null) return UNKNOWN
  if (days <= 0) return 'Closed'
  return days === 1 ? '1 day' : `${days} days`
}

export const fmtMoney = (n: number | null | undefined, opts: { compact?: boolean } = {}): string =>
  n === null || n === undefined ? UNKNOWN : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n >= 1000 || opts.compact ? 0 : 2, ...(opts.compact && n >= 1e6 ? { notation: 'compact', maximumFractionDigits: 1 } : {}) }).format(n)

/** "Oct 5, 2026, 12:00 PM ET" in the viewer's zone; original zone offset noted when it differs. */
export function fmtDeadline(iso: string | null, raw: string | null, tz?: string): string {
  if (!iso) return UNKNOWN
  const d = new Date(iso)
  const hasTime = !raw || /T\d{2}:\d{2}/.test(raw)
  const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: hasTime ? zone : 'America/New_York' }).format(d)
  if (!hasTime) return `${date} (time not stated)`
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: zone }).format(d)
  const m = raw?.match(/([+-]\d{2}):?(\d{2})$/)
  const orig = m ? ` · posted as UTC${m[1]}:${m[2]}` : ''
  return `${date}, ${time}${orig}`
}
export const fmtDate = (v: string | null | undefined): string => {
  if (!v) return UNKNOWN
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v)
  return Number.isNaN(d.getTime()) ? UNKNOWN : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'UTC' : undefined }).format(d)
}
export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never'
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
export const fmtBytes = (n: number | null | undefined): string => (n == null ? UNKNOWN : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`)

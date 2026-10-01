/** Deadline handling: store UTC, keep the original string so the original zone can be shown. */

const ET = 'America/New_York'

function etOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, timeZoneName: 'longOffset' }).formatToParts(at)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-05:00'
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return -300
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

export interface ParsedDeadline {
  iso: string | null
  /** false when SAM gave only a date (time of day not stated) */
  hasTime: boolean
}

export function parseDeadline(raw: string | null | undefined): ParsedDeadline {
  if (!raw) return { iso: null, hasTime: false }
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // Date only: SAM did not state a time. Use end of that day in Eastern Time so a notice is
    // never marked "past" early; the UI shows the date only (hasTime=false).
    const guess = new Date(`${s}T23:59:59Z`)
    const off = etOffsetMinutes(guess)
    return { iso: new Date(guess.getTime() - off * 60000).toISOString(), hasTime: false }
  }
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasZone ? s : `${s}Z`)
  if (Number.isNaN(d.getTime())) return { iso: null, hasTime: false }
  if (!hasZone) {
    // Zone not stated: SAM times are Eastern in practice; reinterpret as ET wall-clock.
    const off = etOffsetMinutes(d)
    return { iso: new Date(d.getTime() - off * 60000).toISOString(), hasTime: true }
  }
  return { iso: d.toISOString(), hasTime: true }
}

/** Original UTC offset of a raw deadline string, e.g. "UTC-04:00" (zone names are ambiguous, offsets are not). */
export function originalZoneLabel(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/Z$/.test(raw)) return 'UTC'
  const m = raw.match(/([+-]\d{2}):?(\d{2})$/)
  return m ? `UTC${m[1]}:${m[2]}` : null
}

export function formatSamDate(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getUTCFullYear()}`
}

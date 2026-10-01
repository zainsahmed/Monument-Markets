import { createHash } from 'node:crypto'

/** Deterministic JSON (sorted keys) so equal content always hashes equal. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Fields whose change means the notice was amended. Order = display order. */
export const TRACKED_FIELDS = [
  'title', 'notice_type', 'notice_type_code', 'solicitation_number', 'response_deadline', 'archive_date',
  'naics', 'psc', 'set_aside_code', 'pop_city', 'pop_state', 'pop_zip', 'pop_country', 'active', 'cancelled',
  'award', 'contacts', 'resource_links',
] as const
export type TrackedField = (typeof TRACKED_FIELDS)[number]

export function trackedSnapshot(o: Record<string, unknown>): Record<TrackedField, unknown> {
  const snap = {} as Record<TrackedField, unknown>
  for (const f of TRACKED_FIELDS) {
    let v = o[f] ?? null
    if (f === 'response_deadline' && typeof v === 'string') v = new Date(v).toISOString() // normalise PG vs ISO formats
    if (f === 'resource_links' && Array.isArray(v)) v = [...v].map(String).sort()
    snap[f] = v
  }
  return snap
}
export const contentHash = (o: Record<string, unknown>) => sha256(stableStringify(trackedSnapshot(o)))

export interface FieldDiff { field: TrackedField; old: unknown; new: unknown }
export function diffTracked(oldRow: Record<string, unknown>, newRow: Record<string, unknown>): FieldDiff[] {
  const a = trackedSnapshot(oldRow)
  const b = trackedSnapshot(newRow)
  return TRACKED_FIELDS.filter((f) => stableStringify(a[f]) !== stableStringify(b[f])).map((f) => ({ field: f, old: a[f], new: b[f] }))
}

/** Which alert type each changed field maps to. */
export function alertTypeForDiff(d: FieldDiff): 'deadline_changed' | 'new_attachment' | 'amendment' {
  if (d.field === 'response_deadline') return 'deadline_changed'
  if (d.field === 'resource_links') {
    const before = new Set((d.old as string[] | null) ?? [])
    const added = ((d.new as string[] | null) ?? []).some((u) => !before.has(u))
    return added ? 'new_attachment' : 'amendment'
  }
  return 'amendment'
}

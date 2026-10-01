import { classify } from '@/lib/classification'
import { contentHash } from './hash'
import { noticeCodeFromName } from './notice-types'
import { parseDeadline } from './time'
import type { NormalizedOpportunity, SamOpportunity } from './types'

/** SAM nests some place-of-performance fields as {code, name}; accept both shapes. */
function nameOf(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const s = (o.name ?? o.code) as string | undefined
    return typeof s === 'string' ? s.trim() || null : null
  }
  return null
}
function codeOf(v: unknown): string | null {
  if (v && typeof v === 'object') {
    const c = (v as Record<string, unknown>).code
    return typeof c === 'string' && c.trim() ? c.trim() : null
  }
  return nameOf(v)
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const isoDate = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** SAM `active` is "Yes"/"No". Unknown values are treated as active so we never hide a live notice. */
export function parseActive(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return !/^(no|false|inactive|archived|cancelled|deleted)$/i.test(v.trim())
  return true
}

export function normaliseOpportunity(s: SamOpportunity, now = new Date()): NormalizedOpportunity {
  const path = str(s.fullParentPathName)
  const segs = path ? path.split('.').map((x) => x.trim()).filter(Boolean) : []
  const dl = parseDeadline(s.responseDeadLine)
  const code = noticeCodeFromName(s.type) ?? noticeCodeFromName(s.baseType)
  const pop = (s.placeOfPerformance ?? {}) as Record<string, unknown>
  const cancelled = /cancel/i.test(`${s.type ?? ''} ${s.archiveType ?? ''}`)
  const archive = isoDate(s.archiveDate)
  let active = parseActive(s.active)
  if (archive && archive < now.toISOString().slice(0, 10)) active = false

  const base = {
    source: 'SAM' as const,
    notice_id: s.noticeId,
    solicitation_number: str(s.solicitationNumber),
    title: str(s.title) ?? 'Untitled notice',
    department: segs[0] ?? null,
    sub_tier: segs[1] ?? null,
    office: segs.length > 2 ? segs[segs.length - 1] : null,
    full_parent_path: path,
    notice_type: str(s.type) ?? str(s.baseType),
    notice_type_code: code,
    posted_date: isoDate(s.postedDate),
    response_deadline: dl.iso,
    response_deadline_raw: str(s.responseDeadLine),
    archive_date: archive,
    naics: str(s.naicsCode),
    psc: str(s.classificationCode),
    set_aside_code: str(s.typeOfSetAside),
    set_aside: str(s.typeOfSetAsideDescription),
    pop_city: nameOf(pop.city),
    pop_state: codeOf(pop.state),
    pop_zip: str(pop.zip),
    pop_country: codeOf(pop.country),
    contacts: Array.isArray(s.pointOfContact) ? s.pointOfContact : [],
    links: Array.isArray(s.links) ? s.links : [],
    resource_links: Array.isArray(s.resourceLinks) ? s.resourceLinks.filter((x): x is string => typeof x === 'string') : [],
    ui_link: str(s.uiLink),
    award: s.award ?? null,
    active,
    cancelled,
    raw: s,
  }
  return { ...base, content_hash: contentHash(base) }
}

export function classifyNormalised(o: Pick<NormalizedOpportunity, 'notice_type_code' | 'active' | 'cancelled' | 'response_deadline'>, now?: Date) {
  return classify({ noticeTypeCode: o.notice_type_code, active: o.active, cancelled: o.cancelled, responseDeadline: o.response_deadline, now })
}

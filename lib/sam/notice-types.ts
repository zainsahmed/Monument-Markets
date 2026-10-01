/** SAM notice-type codes (ptype filter values) and name → code mapping. */
export const NOTICE_TYPES = {
  o: 'Solicitation',
  k: 'Combined Synopsis/Solicitation',
  p: 'Presolicitation',
  r: 'Sources Sought',
  s: 'Special Notice',
  a: 'Award Notice',
  u: 'Justification',
  i: 'Intent to Bundle Requirements',
  g: 'Sale of Surplus Property',
} as const
export type NoticeCode = keyof typeof NOTICE_TYPES | 'dibbs_rfq'

export const NOTICE_LABELS: Record<string, string> = { ...NOTICE_TYPES, dibbs_rfq: 'DIBBS RFQ' }

/** SAM returns the type as text; derive the one-letter code. Order matters (combined before solicitation). */
export function noticeCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('combined synopsis')) return 'k'
  if (n.includes('presolicitation') || n.includes('pre-solicitation')) return 'p'
  if (n.includes('sources sought')) return 'r'
  if (n.includes('special notice')) return 's'
  if (n.includes('award')) return 'a'
  if (n.includes('justification') || n.includes('j&a')) return 'u'
  if (n.includes('intent to bundle')) return 'i'
  if (n.includes('surplus')) return 'g'
  if (n.includes('solicitation')) return 'o'
  return null
}

/** Shapes of the SAM.gov Get Opportunities v2 response (fields per official docs; see docs/DISCREPANCIES.md). */
export interface SamOpportunity {
  noticeId: string
  title?: string | null
  solicitationNumber?: string | null
  fullParentPathName?: string | null
  fullParentPathCode?: string | null
  postedDate?: string | null
  type?: string | null
  baseType?: string | null
  archiveType?: string | null
  archiveDate?: string | null
  typeOfSetAsideDescription?: string | null
  typeOfSetAside?: string | null
  responseDeadLine?: string | null
  naicsCode?: string | null
  classificationCode?: string | null
  active?: string | boolean | null
  award?: {
    date?: string | null
    number?: string | null
    amount?: string | number | null
    awardee?: { name?: string | null; ueiSAM?: string | null; location?: Record<string, unknown> | null } | null
  } | null
  pointOfContact?: Array<Record<string, unknown>> | null
  description?: string | null // a URL — see docs
  organizationType?: string | null
  officeAddress?: Record<string, unknown> | null
  placeOfPerformance?: Record<string, unknown> | null
  additionalInfoLink?: string | null
  uiLink?: string | null
  links?: Array<{ rel?: string; href?: string }> | null
  resourceLinks?: string[] | null
}

export interface SamSearchResponse {
  totalRecords: number
  limit: number
  offset: number
  opportunitiesData: SamOpportunity[]
}

export interface SamSearchParams {
  postedFrom: string // MM/dd/yyyy
  postedTo: string
  limit: number
  offset: number
  ncode?: string
  ptype?: string
}

/** Row written to public.opportunities (SAM source). */
export interface NormalizedOpportunity {
  source: 'SAM'
  notice_id: string
  solicitation_number: string | null
  title: string
  department: string | null
  sub_tier: string | null
  office: string | null
  full_parent_path: string | null
  notice_type: string | null
  notice_type_code: string | null
  posted_date: string | null
  response_deadline: string | null
  response_deadline_raw: string | null
  archive_date: string | null
  naics: string | null
  psc: string | null
  set_aside_code: string | null
  set_aside: string | null
  pop_city: string | null
  pop_state: string | null
  pop_zip: string | null
  pop_country: string | null
  contacts: unknown[]
  links: unknown[]
  resource_links: string[]
  ui_link: string | null
  award: unknown | null
  active: boolean
  cancelled: boolean
  content_hash: string
  raw: unknown
}

/** Hand-maintained row types for the tables the app reads (matches supabase/migrations). */
export type Role = 'owner' | 'member' | 'viewer'
export type ColorLabel = 'GREEN' | 'YELLOW' | 'RED'
export type Level = 'High' | 'Medium' | 'Low' | 'Unknown'

export interface Company {
  id: string; name: string; uei: string | null; cage: string | null; sam_status: string | null; sam_expiration: string | null
  naics_codes: string[]; primary_naics: string | null; business_size: string | null; small_business_status: string | null
  certifications: string[]; geographic_coverage: string | null; industries: string[]; product_categories: string[]; service_categories: string[]
  min_contract_size: number | null; max_contract_size: number | null; min_gross_margin: number | null
  can_subcontract: boolean | null; can_source_products: boolean | null; logistics: string | null; installation: string | null; other_capabilities: string | null
  cmmc_level: string | null; cmmc_date: string | null; sprs_score: number | null; sprs_date: string | null; facility_clearance: string | null
  itar_registered: boolean | null; jcp_certified: boolean | null; target_agencies: string[]; ai_monthly_cap_usd: number; max_upload_mb: number; onboarded_at: string | null
}

export interface Opportunity {
  id: string; company_id: string | null; source: 'SAM' | 'DIBBS'; notice_id: string; solicitation_number: string | null; title: string
  department: string | null; sub_tier: string | null; office: string | null; full_parent_path: string | null
  notice_type: string | null; notice_type_code: string | null; posted_date: string | null
  response_deadline: string | null; response_deadline_raw: string | null; archive_date: string | null
  naics: string | null; psc: string | null; set_aside_code: string | null; set_aside: string | null
  pop_city: string | null; pop_state: string | null; pop_zip: string | null; pop_country: string | null
  description: string | null; description_fetched_at: string | null
  contacts: Array<Record<string, unknown>>; links: unknown[]; resource_links: string[]; ui_link: string | null
  award: Record<string, unknown> | null; dibbs: Record<string, unknown> | null; value_amount: number | null
  active: boolean; cancelled: boolean; color_label: ColorLabel; content_hash: string | null; updated_at: string
}

export interface CompanyOpportunity {
  id: string; company_id: string; opportunity_id: string; workflow_status: 'pursue' | 'review' | 'pass' | 'none'
  pipeline_stage: string | null; saved: boolean; ai_fit: Level | null; complexity: Level | null
  last_viewed_at: string | null; last_viewed_hash: string | null; stage_entered_at: string | null
  submitted_note: string | null; submitted_at: string | null; outcome_reason: string | null; award_amount: number | null
}

export interface OpportunityDocument {
  id: string; opportunity_id: string; company_id: string | null; file_name: string; mime_type: string | null; size_bytes: number | null
  storage_path: string | null; checksum: string | null; page_count: number | null
  parse_status: 'pending' | 'parsed' | 'ocr_needed' | 'failed'; parse_error: string | null; source_url: string | null
}

export const PIPELINE_STAGES = [
  { key: 'new', label: 'New' }, { key: 'reviewing', label: 'Reviewing' }, { key: 'researching', label: 'Researching' },
  { key: 'sourcing', label: 'Sourcing' }, { key: 'pricing', label: 'Pricing' }, { key: 'ready_to_bid', label: 'Ready to Bid' },
  { key: 'submitted', label: 'Submitted' }, { key: 'won', label: 'Won' }, { key: 'lost_passed', label: 'Lost/Passed' },
] as const
export type StageKey = (typeof PIPELINE_STAGES)[number]['key']

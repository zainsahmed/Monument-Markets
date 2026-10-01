-- Fieldpoint core schema. Target: Supabase Postgres 15+.
-- Conventions: uuid pks, created_at/updated_at on every table, company_id on every
-- company-scoped table (denormalised so RLS policies stay simple and fast).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  uei text,
  cage text,
  sam_status text check (sam_status in ('active','inactive','expired','not_registered')),
  sam_expiration date,
  naics_codes text[] not null default '{}',
  primary_naics text,
  business_size text,
  small_business_status text,
  certifications text[] not null default '{}',
  geographic_coverage text,
  industries text[] not null default '{}',
  product_categories text[] not null default '{}',
  service_categories text[] not null default '{}',
  min_contract_size numeric(14,2),
  max_contract_size numeric(14,2),
  min_gross_margin numeric(5,4) check (min_gross_margin is null or (min_gross_margin >= 0 and min_gross_margin < 1)),
  can_subcontract boolean,
  can_source_products boolean,
  logistics text,
  installation text,
  other_capabilities text,
  cmmc_level text check (cmmc_level in ('none','level1','level2','level3')),
  cmmc_date date,
  sprs_score integer check (sprs_score is null or (sprs_score between -203 and 110)),
  sprs_date date,
  facility_clearance text,
  itar_registered boolean,
  jcp_certified boolean,
  -- operational settings
  target_agencies text[] not null default '{}',
  ai_monthly_cap_usd numeric(10,2) not null default 50,
  max_upload_mb integer not null default 50,
  onboarded_at timestamptz,
  unique (id)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  avatar text,
  preferences jsonb not null default '{}'::jsonb  -- theme, density, column visibility
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member','viewer')),
  unique (company_id, user_id)
);

create table public.company_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','member','viewer')),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  unique (company_id, email)
);

-- ------------------------------------------------------------ opportunities
-- Public SAM data is shared (company_id null). DIBBS imports are company-private.
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete cascade,
  source text not null check (source in ('SAM','DIBBS')),
  notice_id text not null,
  solicitation_number text,
  title text not null,
  department text,
  sub_tier text,
  office text,
  full_parent_path text,
  notice_type text,
  notice_type_code text,
  posted_date date,
  response_deadline timestamptz,
  response_deadline_raw text,      -- original string incl. offset, for "12:00 PM ET" display
  archive_date date,
  naics text,
  psc text,
  set_aside_code text,
  set_aside text,
  pop_city text,
  pop_state text,
  pop_zip text,
  pop_country text,
  description text,
  description_fetched_at timestamptz,
  contacts jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  resource_links jsonb not null default '[]'::jsonb,
  ui_link text,
  award jsonb,
  dibbs jsonb,                      -- NSN, P/N, qty, unit of issue, etc. (DIBBS only)
  active boolean not null default true,
  cancelled boolean not null default false,
  color_label text not null default 'YELLOW' check (color_label in ('GREEN','YELLOW','RED')),
  content_hash text,
  raw jsonb,
  search_vector tsvector,
  last_seen_at timestamptz not null default now(),
  unique (id, company_id)
);
create unique index opportunities_source_notice_public on public.opportunities (source, notice_id) where company_id is null;
create unique index opportunities_source_notice_private on public.opportunities (source, notice_id, company_id) where company_id is not null;

create table public.company_opportunities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  workflow_status text not null default 'none' check (workflow_status in ('pursue','review','pass','none')),
  pipeline_stage text,
  saved boolean not null default false,
  ai_fit text check (ai_fit in ('High','Medium','Low','Unknown')),
  complexity text check (complexity in ('High','Medium','Low','Unknown')),
  last_viewed_at timestamptz,
  last_viewed_hash text,
  stage_entered_at timestamptz,
  submitted_note text,
  submitted_at timestamptz,
  outcome_reason text,
  award_amount numeric(14,2),
  unique (company_id, opportunity_id),
  unique (id, company_id)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  key text not null unique,
  label text not null,
  position integer not null unique,
  terminal boolean not null default false
);
alter table public.company_opportunities
  add constraint company_opportunities_stage_fk foreign key (pipeline_stage) references public.pipeline_stages(key);

create table public.opportunity_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade, -- null = public SAM attachment
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,
  checksum text,
  page_count integer,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsed','ocr_needed','failed')),
  parse_error text,
  source_url text,
  fetched_at timestamptz,
  unique (id, opportunity_id)
);
create unique index opportunity_documents_dedupe on public.opportunity_documents (opportunity_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), checksum) where checksum is not null;

create table public.document_pages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  document_id uuid not null references public.opportunity_documents(id) on delete cascade,
  page_number integer not null,          -- PDF page, 1 for DOCX/TXT, sheet index for XLSX
  section_heading text,                  -- section / sheet name
  locator text,                          -- e.g. "Sheet1!A1:F40" for XLSX
  text text not null default '',
  page_reliable boolean not null default true, -- false for DOCX (no real pages)
  search_vector tsvector generated always as (to_tsvector('english', coalesce(text,''))) stored,
  unique (document_id, page_number, section_heading)
);

create table public.opportunity_amendments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  detected_at timestamptz not null default now(),
  field text not null,
  old_value jsonb,
  new_value jsonb,
  sync_run_id uuid
);

-- ------------------------------------------------------------------ AI
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid,
  kind text not null check (kind in ('brief','extraction','search')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric(10,4) not null default 0,
  output jsonb,
  citation_rejections integer not null default 0,
  citation_total integer not null default 0,
  source_hash text,                 -- content hash of inputs; detects "source changed"
  status text not null default 'pending' check (status in ('pending','complete','error')),
  error text,
  created_by uuid references auth.users(id),
  unique (id, company_id),
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

create table public.extracted_facts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  analysis_id uuid not null,
  category text not null,
  text text not null,
  label text not null check (label in ('VERIFIED','ANALYSIS','NEEDS_VERIFICATION')),
  document_id uuid references public.opportunity_documents(id) on delete set null,
  page integer,
  section text,
  snippet text,
  verified boolean not null default false,
  foreign key (analysis_id, company_id) references public.ai_analyses(id, company_id) on delete cascade
);

-- ------------------------------------------------------------ checklist etc.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid not null,
  "group" text not null,
  key text not null,
  label text not null,
  status text not null default 'UNKNOWN' check (status in ('PASS','FAIL','UNKNOWN','NA')),
  ai_suggestion jsonb,               -- { status, rationale, label, citations } -- never auto-applied
  note text,
  evidence jsonb,
  updated_by uuid references auth.users(id),
  unique (company_opportunity_id, key),
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  items jsonb not null           -- [{group,key,label}]
);

create table public.historical_awards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  award_id text not null,
  generated_internal_id text,
  recipient text,
  agency text,
  sub_agency text,
  award_date date,
  amount numeric(16,2),
  contract_type text,
  naics text,
  psc text,
  set_aside text,
  pop text,
  matched_by text[] not null default '{}',
  usaspending_url text,
  unique (opportunity_id, award_id)
);

create table public.historical_lookups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  strategies jsonb not null default '[]'::jsonb  -- per strategy: {name, count, error?}
);

-- ---------------------------------------------------------------- suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  website text,
  contact jsonb not null default '{}'::jsonb,
  categories text[] not null default '{}',
  products text[] not null default '{}',
  status text check (status in ('manufacturer','authorized_distributor','reseller')),
  lead_time_days integer,
  certifications text[] not null default '{}',
  country_of_origin text,
  coverage text,
  notes text,
  unique (id, company_id)
);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null,
  company_opportunity_id uuid,
  amount numeric(14,2) not null,
  currency text not null default 'USD',
  quote_date date not null,
  valid_until date,
  file_path text,
  notes text,
  unique (id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers(id, company_id) on delete cascade,
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete set null (company_opportunity_id)
);

create table public.opportunity_suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid not null,
  supplier_id uuid not null,
  sourcing_checklist jsonb not null default '{}'::jsonb,
  unique (company_opportunity_id, supplier_id),
  foreign key (supplier_id, company_id) references public.suppliers(id, company_id) on delete cascade,
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

-- ------------------------------------------------------------------ pricing
create table public.pricing (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid not null,
  version integer not null,
  label text,
  desired_margin numeric(5,4) check (desired_margin is null or (desired_margin >= 0 and desired_margin < 1)),
  target_price numeric(16,2),
  notes text,
  is_estimated boolean not null default true,
  created_by uuid references auth.users(id),
  unique (company_opportunity_id, version),
  unique (id, company_id),
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

-- NULL cost = blank input (never silently treated as zero in the UI).
create table public.pricing_lines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pricing_id uuid not null,
  position integer not null default 0,
  clin text,
  description text,
  unit_cost numeric(14,4),
  quantity numeric(14,4),
  shipping numeric(14,2),
  labor numeric(14,2),
  subcontractors numeric(14,2),
  travel numeric(14,2),
  insurance numeric(14,2),
  other numeric(14,2),
  quote_id uuid,
  foreign key (pricing_id, company_id) references public.pricing(id, company_id) on delete cascade,
  foreign key (quote_id, company_id) references public.supplier_quotes(id, company_id) on delete set null (quote_id)
);

-- ----------------------------------------------------------- workflow items
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid not null,
  author_id uuid references auth.users(id),
  body text not null,
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_opportunity_id uuid not null,
  title text not null,
  due_date date,
  assignee_id uuid references auth.users(id),
  done boolean not null default false,
  foreign key (company_opportunity_id, company_id) references public.company_opportunities(id, company_id) on delete cascade
);

-- ------------------------------------------------------------------- alerts
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_match','deadline','amendment','new_attachment','deadline_changed','text_changed','quote_received','quote_expiring','status_changed')),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  title text not null,
  link_tab text,                      -- detail-page tab the alert points to
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  emailed_at timestamptz,
  dedupe_key text not null unique
);

create table public.alert_preferences (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  in_app boolean not null default true,
  email boolean not null default false,
  digest boolean not null default true,
  deadline_offsets integer[] not null default '{7,3,1}',
  unique (user_id, type)
);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  alerts_enabled boolean not null default false,
  last_checked_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  action text not null,
  before jsonb,
  after jsonb
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null check (source in ('SAM','USASPENDING')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  purpose text not null default 'sync' check (purpose in ('sync','on_demand')),
  window_from date,
  window_to date,
  calls_used integer not null default 0,
  found integer not null default 0,        -- notices returned by SAM before local filtering
  inserted integer not null default 0,
  updated integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  status text not null default 'running' check (status in ('running','complete','partial','quota_exhausted','error')),
  cursor jsonb,                            -- resumable position for partial runs
  next_allowed_at timestamptz
);

create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  bucket text not null
);

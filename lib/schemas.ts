import { z } from 'zod'

const uuid = z.string().uuid()
/** Shared client/server validation schemas (spec: Zod schemas shared by forms and server actions). */

const costNum = z.number().nonnegative().max(1e10).nullable()
export const PricingSaveSchema = z.object({
  coId: uuid, label: z.string().max(100).optional(), desiredMargin: z.number().min(0).lt(1).nullable(), targetPrice: z.number().positive().nullable(), notes: z.string().max(5000).optional(), isEstimated: z.boolean(),
  lines: z.array(z.object({ clin: z.string().max(40).nullable(), description: z.string().max(500).nullable(), unit_cost: costNum, quantity: costNum, shipping: costNum, labor: costNum, subcontractors: costNum, travel: costNum, insurance: costNum, other: costNum, quote_id: uuid.nullable() })).max(200),
})

const list = z.array(z.string().trim().min(1).max(100)).max(100)
export const SupplierSchema = z.object({
  name: z.string().trim().min(1).max(200), website: z.string().trim().max(300).optional().or(z.literal('')),
  contact: z.object({ name: z.string().max(200).optional(), email: z.string().max(200).optional(), phone: z.string().max(60).optional() }).default({}),
  categories: list.default([]), products: list.default([]), status: z.enum(['manufacturer', 'authorized_distributor', 'reseller']).nullable().default(null),
  lead_time_days: z.number().int().min(0).max(3650).nullable().default(null), certifications: list.default([]), country_of_origin: z.string().max(100).nullable().default(null),
  coverage: z.string().max(500).nullable().default(null), notes: z.string().max(5000).nullable().default(null),
})


export const SOURCING_STEPS = [
  ['supplier_found', 'Supplier found'], ['product_identified', 'Product / model identified'], ['availability_confirmed', 'Availability confirmed'],
  ['quote_requested', 'Quote requested'], ['quote_received', 'Quote received'], ['lead_time_confirmed', 'Lead time confirmed'],
  ['shipping_confirmed', 'Shipping confirmed'], ['compliance_confirmed', 'Compliance confirmed (Berry / TAA / origin, approved source)'],
] as const


const arr = z.array(z.string().trim().min(1).max(100)).max(200).default([])
const naics = z.string().regex(/^\d{2,6}$/, 'NAICS codes are 2–6 digits')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
const num = z.number().nonnegative().max(1e12).nullable()

export const CompanySchema = z.object({
  name: z.string().trim().min(1).max(200), uei: z.string().trim().max(20).nullable(), cage: z.string().trim().max(10).nullable(),
  sam_status: z.enum(['active', 'inactive', 'expired', 'not_registered']).nullable(), sam_expiration: date,
  naics_codes: z.array(naics).max(50), primary_naics: naics.nullable(), business_size: z.string().max(100).nullable(), small_business_status: z.string().max(200).nullable(),
  certifications: arr, geographic_coverage: z.string().max(500).nullable(), industries: arr, product_categories: arr, service_categories: arr,
  min_contract_size: num, max_contract_size: num, min_gross_margin: z.number().min(0).lt(1).nullable(),
  can_subcontract: z.boolean().nullable(), can_source_products: z.boolean().nullable(), logistics: z.string().max(1000).nullable(), installation: z.string().max(1000).nullable(), other_capabilities: z.string().max(2000).nullable(),
  cmmc_level: z.enum(['none', 'level1', 'level2', 'level3']).nullable(), cmmc_date: date, sprs_score: z.number().int().min(-203).max(110).nullable(), sprs_date: date,
  facility_clearance: z.string().max(100).nullable(), itar_registered: z.boolean().nullable(), jcp_certified: z.boolean().nullable(),
  target_agencies: arr,
})
export type CompanyInput = z.infer<typeof CompanySchema>

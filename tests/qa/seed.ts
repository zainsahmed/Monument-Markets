/**
 * QA-ONLY fixtures for local end-to-end runs and design QA. Everything here goes into the throwaway fp_qa database,
 * never into the product. SAM-shaped notices are passed through the app's real normaliser; documents go through the
 * app's real ingestion (storage + extraction); historical awards come live from USAspending.
 */
import type { Pool } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { normaliseOpportunity } from '@/lib/sam/normalise'
import type { SamOpportunity } from '@/lib/sam/types'
import { ingestDocument } from '@/lib/opportunities/documents'
import { lookupHistoricalAwards } from '@/lib/usaspending'
import { makePdf } from '../fixtures/pdf'
import { hashPassword, SERVICE_KEY } from './shim/server'

export const QA = { password: 'qa-password-123', owner: 'owner@qa.test', member: 'member@qa.test', viewer: 'viewer@qa.test' }
const day = (n: number, h = 14) => { const d = new Date(Date.now() + n * 864e5); d.setUTCHours(h, 0, 0, 0); return d.toISOString().replace('.000Z', '-04:00').replace('Z', '-04:00') }
const posted = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const PATH = 'DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC-RSA'
const base = (i: number, o: Partial<SamOpportunity>): SamOpportunity => ({ noticeId: `qa-notice-${String(i).padStart(3, '0')}`, solicitationNumber: `W911QY-26-Q-${String(1000 + i)}`, fullParentPathName: PATH, postedDate: posted(i % 12), type: 'Solicitation', archiveDate: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10), naicsCode: '336413', classificationCode: '1560', active: 'Yes', typeOfSetAside: 'SBA', typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)', responseDeadLine: day(10 + (i % 25)), uiLink: `https://sam.gov/opp/qa-notice-${i}/view`, pointOfContact: [{ type: 'primary', fullName: 'Pat Contracting', email: 'pat.contracting@army.example.mil', phone: '256-555-0100' }], placeOfPerformance: { city: { name: 'Huntsville' }, state: { code: 'AL' }, zip: '35898', country: { code: 'USA' } }, resourceLinks: [], ...o })

const ITEMS: Array<[string, Partial<SamOpportunity>]> = [
  ['Hydraulic pump assembly, P/N 1234-56, qty 40', { naicsCode: '336413', classificationCode: '4320' }],
  ['Aircraft landing gear actuator overhaul services', { type: 'Combined Synopsis/Solicitation', naicsCode: '336413', classificationCode: 'J015' }],
  ['Machined bracket, aluminum 7075, MIL-DTL-5541 finish', { naicsCode: '332710', classificationCode: '1560' }],
  ['Engineering and technical support — avionics integration', { type: 'Sources Sought', naicsCode: '541330', classificationCode: 'R425', responseDeadLine: day(12) }],
  ['Rotary wing blade repair kit (Presolicitation)', { type: 'Presolicitation', naicsCode: '336413', responseDeadLine: undefined }],
  ['Fuel system filter element, NSN 2910-01-234-5678', { naicsCode: '336413', classificationCode: '2910', typeOfSetAside: undefined, typeOfSetAsideDescription: undefined }],
  ['Award: Fabrication of ground support equipment', { type: 'Award Notice', naicsCode: '332999', award: { date: posted(3), number: 'W911QY26C0042', amount: '1284500.00', awardee: { name: 'Redstone Fabrication LLC', ueiSAM: 'ABC123DEF456' } }, responseDeadLine: undefined }],
  ['Justification: sole source spares for legacy radar', { type: 'Justification', naicsCode: '334511', responseDeadLine: undefined }],
  ['Cancelled: Janitorial services, Building 5250', { type: 'Solicitation', naicsCode: '561720', archiveType: 'cancelled', active: 'No' }],
  ['Special Notice: Industry day for vehicle sustainment', { type: 'Special Notice', naicsCode: '336211', responseDeadLine: day(20) }],
  ['Electrical connector, circular, MIL-DTL-38999 series III', { naicsCode: '335931', classificationCode: '5935' }],
  ['Bearing, roller, spherical — replacement stock', { naicsCode: '332991', classificationCode: '3110', responseDeadLine: day(2) }],
  ['Thermal imaging camera mounting hardware', { naicsCode: '336413', classificationCode: '5855', responseDeadLine: day(3) }],
  ['Calibration services for torque wrenches (annual)', { naicsCode: '811219', classificationCode: 'H941', responseDeadLine: day(6) }],
  ['Tactical shelter repair — Fort Rucker', { naicsCode: '332311', classificationCode: 'J054' }],
  ['Seal kit, hydraulic cylinder', { naicsCode: '339991', classificationCode: '5330' }],
  ['Packaging, military-grade, for spare parts (MIL-STD-2073-1)', { naicsCode: '561910', classificationCode: 'N099' }],
  ['A very long title that keeps going to prove the two-line clamp works correctly in the card view and the table: Maintenance, repair and overhaul of airframe structural components for rotary-wing and fixed-wing aircraft at multiple Army installations across the continental United States including Alabama, Texas and Georgia', { naicsCode: '336413' }],
  ['Fastener assortment, corrosion-resistant steel', { naicsCode: '332722', classificationCode: '5305', fullParentPathName: 'DEPT OF DEFENSE.DEFENSE LOGISTICS AGENCY.DLA LAND AND MARITIME' }],
  ['Generator set, 10 kW, tactical quiet', { naicsCode: '335312', classificationCode: '6115', placeOfPerformance: { city: { name: 'Tobyhanna' }, state: { code: 'PA' }, zip: '18466', country: { code: 'USA' } } }],
  ['Notice with no NAICS or PSC and no place of performance', { naicsCode: undefined, classificationCode: undefined, placeOfPerformance: undefined, typeOfSetAside: undefined, typeOfSetAsideDescription: undefined }],
  ['Airframe skin panel fabrication', { naicsCode: '336413', classificationCode: '1560', responseDeadLine: day(30) }],
  ['Wiring harness assembly, flight line test set', { naicsCode: '335931', classificationCode: '6150', responseDeadLine: day(16) }],
  ['Environmental control unit overhaul', { naicsCode: '333415', classificationCode: 'J042', responseDeadLine: day(25) }],
  ['Radome inspection and repair', { naicsCode: '336413', classificationCode: 'J015', responseDeadLine: day(9) }],
]

const DESCRIPTIONS = [
  '<p>The Government intends to procure <b>forty (40)</b> hydraulic pump assemblies in accordance with the attached specification. Offers shall include first article test plans.</p><ul><li>Delivery: 90 days ARO</li><li>FOB Destination</li></ul><script>alert("xss")</script><p onclick="steal()">Questions are due ten days before the closing date.</p>',
  'Plain-text description: the contractor shall provide all labor, materials and equipment to perform overhaul services.\n\nPlace of performance is the contractor facility.',
]

export async function seed(pool: Pool, shimUrl: string) {
  // ---- users, company, members
  const users: Record<string, string> = {}
  for (const [role, email] of [['owner', QA.owner], ['member', QA.member], ['viewer', QA.viewer]] as const) {
    const r = await pool.query('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [email])
    users[role] = r.rows[0].id
    await pool.query('insert into auth.qa_credentials (user_id, pw) values ($1,$2)', [users[role], hashPassword(QA.password)])
    await pool.query('insert into profiles (user_id, full_name) values ($1,$2)', [users[role], role[0].toUpperCase() + role.slice(1) + ' QA'])
  }
  const co = (await pool.query(`insert into companies (name, uei, cage, sam_status, sam_expiration, naics_codes, primary_naics, business_size, small_business_status, certifications, geographic_coverage, product_categories, min_contract_size, max_contract_size, min_gross_margin, can_source_products, cmmc_level, sprs_score, sprs_date, itar_registered, onboarded_at)
    values ('QA Aerospace Components','QAUEI1234567','1QA23','active',(current_date + 200),'{336413,332710,541330}','336413','Small','SDVOSB','{AS9100,"ISO 9001"}','Southeast US','{"hydraulic components","machined parts"}',10000,2000000,0.15,true,'level1',88,(current_date - 120),true,now()) returning id`)).rows[0].id
  await pool.query(`insert into company_members (company_id, user_id, role) values ($1,$2,'owner'),($1,$3,'member'),($1,$4,'viewer')`, [co, users.owner, users.member, users.viewer])
  await pool.query(`insert into alert_preferences (user_id, type, in_app, email, digest, deadline_offsets) values ($1,'deadline',true,false,true,'{7,3,1}')`, [users.owner])

  // ---- opportunities through the real normaliser
  const ids: string[] = []
  for (let i = 0; i < ITEMS.length; i++) {
    const [title, o] = ITEMS[i]
    const n = normaliseOpportunity(base(i + 1, { title, ...o, resourceLinks: i === 0 ? ['https://sam.gov/api/prod/opps/v3/opportunities/resources/files/qa/download'] : [] }))
    const { raw: _raw, ...row } = n
    const cols = Object.keys(row)
    const vals = cols.map((c) => { const v = (row as Record<string, unknown>)[c]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v })
    const r = await pool.query(`insert into opportunities (${cols.map((c) => `"${c}"`).join(',')}, raw, description, description_fetched_at) values (${cols.map((_, j) => `$${j + 1}`).join(',')}, $${cols.length + 1}, $${cols.length + 2}, now()) returning id`, [...vals, JSON.stringify({ description: 'https://api.sam.gov/prod/opportunities/v1/noticedesc?noticeid=qa' }), i < 2 ? DESCRIPTIONS[i] : i < 12 ? `Description for “${title}”. Offers will be evaluated on price and technical acceptability.` : null])
    ids.push(r.rows[0].id)
  }
  // an amendment chain on solicitation W911QY-26-Q-1001 (presolicitation -> solicitation)
  await pool.query(`update opportunities set solicitation_number = 'W911QY-26-Q-1001' where id = $1`, [ids[4]])

  // ---- documents through the real ingestion (storage + extraction), as the shim-backed admin client
  const admin = createClient(shimUrl, SERVICE_KEY, { auth: { persistSession: false } })
  const rfq = makePdf([
    'SECTION B - SUPPLIES OR SERVICES AND PRICES\nCLIN 0001 Hydraulic pump assembly P/N 1234-56 quantity 40 EA\nPrice shall be firm fixed price for each unit.',
    'SECTION F - DELIVERIES OR PERFORMANCE\nDelivery shall be made within 90 days after receipt of order FOB Destination.\nFirst article testing is required prior to production deliveries.',
    'SECTION D - PACKAGING AND MARKING\nPackaging shall be in accordance with MIL-STD-2073-1 Level A.\nMarking shall be in accordance with MIL-STD-129.',
  ])
  await ingestDocument(admin as never, { opportunityId: ids[0], companyId: null, fileName: 'W911QY-26-Q-1001_RFQ.pdf', mime: 'application/pdf', bytes: rfq, sourceUrl: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/qa/download', maxMb: 50 })
  await ingestDocument(admin as never, { opportunityId: ids[0], companyId: null, fileName: 'Scanned_Drawing.pdf', mime: 'application/pdf', bytes: makePdf(['', '']), maxMb: 50 })

  // ---- real historical awards from USAspending (live) for the first opportunity
  try {
    const hist = await lookupHistoricalAwards({ title: ITEMS[0][0], naics: '336413', psc: '4320', department: 'DEPT OF DEFENSE' })
    for (const a of hist.awards.slice(0, 120)) await pool.query(`insert into historical_awards (opportunity_id, award_id, generated_internal_id, recipient, agency, sub_agency, award_date, amount, contract_type, naics, psc, set_aside, pop, matched_by, usaspending_url) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing`, [ids[0], a.award_id, a.generated_internal_id, a.recipient, a.agency, a.sub_agency, a.award_date, a.amount, a.contract_type, a.naics, a.psc, a.set_aside, a.pop, a.matched_by, a.usaspending_url])
    await pool.query(`insert into historical_lookups (opportunity_id, strategies) values ($1,$2)`, [ids[0], JSON.stringify(hist.strategies)])
  } catch (e) { console.warn('USAspending unavailable; skipping historical seed', e instanceof Error ? e.message : e) }

  // ---- member's working state: saved, pursuing, pipeline, suppliers, quotes, notes, tasks, alerts
  const wf = async (idx: number, p: Record<string, unknown>) => (await pool.query(`insert into company_opportunities (company_id, opportunity_id, ${Object.keys(p).join(',')}) values ($1,$2,${Object.keys(p).map((_, i) => `$${i + 3}`).join(',')}) returning id`, [co, ids[idx], ...Object.values(p)])).rows[0].id as string
  const c0 = await wf(0, { saved: true, workflow_status: 'pursue', pipeline_stage: 'sourcing' })
  const c1 = await wf(1, { saved: true, workflow_status: 'review', pipeline_stage: 'reviewing' })
  await wf(2, { saved: true, pipeline_stage: 'new' })
  await wf(11, { saved: true, workflow_status: 'review', pipeline_stage: 'researching' })
  await wf(12, { pipeline_stage: 'ready_to_bid', ai_fit: 'High', complexity: 'Low' })
  await wf(13, { pipeline_stage: 'pricing' })
  await wf(5, { workflow_status: 'pass' })
  await wf(6, { pipeline_stage: 'won', award_amount: 1284500 })
  const sup = (await pool.query(`insert into suppliers (company_id, name, website, contact, categories, products, status, lead_time_days, certifications, country_of_origin, coverage) values ($1,'Redstone Hydraulics Inc.','https://redstone-hydraulics.example','{"name":"Dana Supply","email":"dana@redstone-hydraulics.example","phone":"256-555-0142"}','{hydraulics,pumps}','{"1234-56"}','authorized_distributor',45,'{AS9100}','USA','Nationwide'),($1,'Tri-State Machining','https://tristate-machining.example','{}','{"machined parts"}','{}','manufacturer',30,'{"ISO 9001"}','USA','Southeast') returning id`, [co])).rows
  await pool.query(`insert into opportunity_suppliers (company_id, company_opportunity_id, supplier_id, sourcing_checklist) values ($1,$2,$3,'{"supplier_found":true,"product_identified":true}')`, [co, c0, sup[0].id])
  await pool.query(`insert into supplier_quotes (company_id, supplier_id, company_opportunity_id, amount, quote_date, valid_until) values ($1,$2,$3,28400,current_date - 3,current_date + 5)`, [co, sup[0].id, c0])
  await pool.query(`insert into notes (company_id, company_opportunity_id, author_id, body) values ($1,$2,$3,'<p>Called the distributor — they can ship <strong>40 units</strong> in 6 weeks.</p>')`, [co, c0, users.member])
  await pool.query(`insert into tasks (company_id, company_opportunity_id, title, due_date, assignee_id) values ($1,$2,'Request refreshed quote',current_date + 3,$3)`, [co, c0, users.member])
  await pool.query(`insert into alerts (company_id, user_id, type, opportunity_id, title, link_tab, dedupe_key) values ($1,$2,'deadline',$3,'Due in 3 days: Thermal imaging camera mounting hardware','overview','qa-1'),($1,$2,'amendment',$4,'Amended (deadline): Hydraulic pump assembly, P/N 1234-56, qty 40','activity','qa-2')`, [co, users.member, ids[12], ids[0]])
  await pool.query(`insert into opportunity_amendments (opportunity_id, field, old_value, new_value) values ($1,'response_deadline','"2026-10-05T18:00:00.000Z"','"2026-10-12T18:00:00.000Z"')`, [ids[0]])
  return { users, company: co, opportunityIds: ids }
}

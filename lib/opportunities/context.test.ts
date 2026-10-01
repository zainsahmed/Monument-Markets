import { describe, expect, it } from 'vitest'
import { briefTask, noticeDocument, profileForAi, sourceHash } from './context'
import { verifyCitation, buildIndex } from '@/lib/ai/citations'
import type { Company, Opportunity } from '@/lib/db-types'

const opp = { id: 'o1', source: 'SAM', title: 'Hydraulic pump', solicitation_number: 'W911-26-Q-0001', notice_type: 'Solicitation', department: 'DEPT OF DEFENSE', full_parent_path: 'DEPT OF DEFENSE.ARMY', posted_date: '2026-09-30', response_deadline: '2026-10-20T18:00:00.000Z', response_deadline_raw: '2026-10-20T14:00:00-04:00', naics: '336413', psc: null, set_aside: 'Total Small Business', set_aside_code: 'SBA', pop_city: 'Huntsville', pop_state: 'AL', pop_zip: null, pop_country: 'USA', active: true, cancelled: false, description: '<p>Provide <b>40</b> pumps.</p>', description_fetched_at: '2026-10-01T00:00:00Z', value_amount: null, dibbs: null, award: null, content_hash: 'h' } as unknown as Opportunity
const co = { name: 'Acme', sprs_score: 88, min_gross_margin: 0.15, naics_codes: ['336413'] } as unknown as Company

describe('noticeDocument', () => {
  it('renders stored fields, uses Unknown for missing data, and is citable', () => {
    const d = noticeDocument(opp)
    const text = d.pages[0].text
    expect(text).toContain('PSC: Unknown')
    expect(text).toContain('Solicitation number: W911-26-Q-0001')
    expect(text).not.toContain('<p>')
    expect(verifyCitation({ documentId: d.documentId, page: 0, section: 'Notice record', snippet: 'Solicitation number: W911-26-Q-0001' }, buildIndex([d])).ok).toBe(true)
  })
  it('says the description is not yet retrieved rather than implying there is none', () => {
    const t = noticeDocument({ ...opp, description: null, description_fetched_at: null }).pages[0].text
    expect(t).toMatch(/not yet retrieved/)
  })
  it('includes DIBBS fields', () => {
    const t = noticeDocument({ ...opp, source: 'DIBBS', dibbs: { nsn: '4320-01-234-5678', quantity: 40, missing: ['Packaging'] } } as unknown as Opportunity).pages[0].text
    expect(t).toContain('DIBBS nsn: 4320-01-234-5678')
    expect(t).not.toContain('Packaging')
  })
})
describe('AI inputs', () => {
  it('profile for AI never includes supplier/pricing data and task lists checklist keys', () => {
    expect(JSON.stringify(profileForAi(co))).not.toMatch(/supplier|quote|pricing/i)
    expect(briefTask(co, [{ key: 'sam_registration', label: 'SAM registration active' }], new Date('2026-10-01T00:00:00Z'))).toContain('- sam_registration: SAM registration active')
  })
  it('source hash changes when notice, description or documents change', () => {
    const a = sourceHash(opp, ['x'], 10)
    expect(sourceHash(opp, ['x'], 10)).toBe(a)
    expect(sourceHash({ ...opp, content_hash: 'h2' }, ['x'], 10)).not.toBe(a)
    expect(sourceHash(opp, ['x', 'y'], 10)).not.toBe(a)
    expect(sourceHash(opp, ['x'], 11)).not.toBe(a)
  })
})

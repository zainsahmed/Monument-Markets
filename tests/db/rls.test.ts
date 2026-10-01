import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asUser, createTestDb, dbAvailable } from './helpers'

const run = dbAvailable() ? describe : describe.skip

run('RLS & integrity (local Postgres)', () => {
  let admin: Client
  let drop: () => Promise<void>
  const ids = {
    ownerA: '00000000-0000-0000-0000-0000000000a1',
    memberA: '00000000-0000-0000-0000-0000000000a2',
    viewerA: '00000000-0000-0000-0000-0000000000a3',
    ownerB: '00000000-0000-0000-0000-0000000000b1',
  }
  let companyA = ''
  let companyB = ''
  let publicOpp = ''
  let coA = ''

  beforeAll(async () => {
    const db = await createTestDb('fp_rls')
    admin = db.admin
    drop = db.drop
    for (const [k, v] of Object.entries(ids)) await admin.query('insert into auth.users (id, email) values ($1, $2)', [v, `${k}@x.test`])
    companyA = await asUser(admin, ids.ownerA, async (q) => (await q(`select create_company('A Co') as id`)).rows[0].id)
    companyB = await asUser(admin, ids.ownerB, async (q) => (await q(`select create_company('B Co') as id`)).rows[0].id)
    await asUser(admin, ids.ownerA, async (q) => {
      await q(`insert into company_members (company_id, user_id, role) values ($1,$2,'member'), ($1,$3,'viewer')`, [companyA, ids.memberA, ids.viewerA])
    })
    publicOpp = (await admin.query(
      `insert into opportunities (source, notice_id, title, notice_type_code, response_deadline) values ('SAM','n1','Public opp','o', now() + interval '10 days') returning id`,
    )).rows[0].id
    coA = await asUser(admin, ids.memberA, async (q) =>
      (await q(`insert into company_opportunities (company_id, opportunity_id) values ($1,$2) returning id`, [companyA, publicOpp])).rows[0].id)
  })
  afterAll(async () => { await drop?.() })

  it('isolates company data between tenants', async () => {
    const rows = await asUser(admin, ids.ownerB, (q) => q('select * from company_opportunities'))
    expect(rows.rows).toHaveLength(0)
    const companies = await asUser(admin, ids.ownerB, (q) => q('select id from companies'))
    expect(companies.rows.map((r) => r.id)).toEqual([companyB])
  })

  it('shares public SAM opportunities with every signed-in user', async () => {
    const r = await asUser(admin, ids.ownerB, (q) => q('select id from opportunities'))
    expect(r.rows.map((x) => x.id)).toContain(publicOpp)
  })

  it('hides DIBBS (private) opportunities from other companies', async () => {
    await admin.query(`insert into opportunities (source, notice_id, title, notice_type_code, company_id) values ('DIBBS','d1','Private RFQ','dibbs_rfq',$1)`, [companyA])
    const b = await asUser(admin, ids.ownerB, (q) => q(`select 1 from opportunities where source='DIBBS'`))
    const a = await asUser(admin, ids.memberA, (q) => q(`select 1 from opportunities where source='DIBBS'`))
    expect(b.rows).toHaveLength(0)
    expect(a.rows).toHaveLength(1)
  })

  it('denies cross-tenant writes', async () => {
    await expect(asUser(admin, ids.ownerB, (q) =>
      q(`insert into notes (company_id, company_opportunity_id, body) values ($1,$2,'x')`, [companyA, coA]))).rejects.toThrow()
  })

  it('blocks inserting a row that points at another tenant\'s company_opportunity (composite FK)', async () => {
    await expect(asUser(admin, ids.ownerB, (q) =>
      q(`insert into notes (company_id, company_opportunity_id, body) values ($1,$2,'x')`, [companyB, coA]))).rejects.toThrow(/foreign key/i)
  })

  it('lets members write and viewers only read working data', async () => {
    await asUser(admin, ids.memberA, (q) => q(`insert into notes (company_id, company_opportunity_id, body, author_id) values ($1,$2,'hello',$3)`, [companyA, coA, ids.memberA]))
    const v = await asUser(admin, ids.viewerA, (q) => q('select body from notes'))
    expect(v.rows).toHaveLength(1)
    await expect(asUser(admin, ids.viewerA, (q) =>
      q(`insert into notes (company_id, company_opportunity_id, body) values ($1,$2,'nope')`, [companyA, coA]))).rejects.toThrow(/row-level security/)
  })

  it('hides supplier and pricing data from viewers', async () => {
    const supplierId = await asUser(admin, ids.memberA, async (q) =>
      (await q(`insert into suppliers (company_id, name) values ($1,'Acme') returning id`, [companyA])).rows[0].id)
    await asUser(admin, ids.memberA, (q) => q(`insert into pricing (company_id, company_opportunity_id, version) values ($1,$2,1)`, [companyA, coA]))
    expect((await asUser(admin, ids.memberA, (q) => q('select id from suppliers'))).rows).toHaveLength(1)
    expect((await asUser(admin, ids.viewerA, (q) => q('select id from suppliers'))).rows).toHaveLength(0)
    expect((await asUser(admin, ids.viewerA, (q) => q('select id from pricing'))).rows).toHaveLength(0)
    expect(supplierId).toBeTruthy()
  })

  it('only owners manage members and the company profile', async () => {
    await expect(asUser(admin, ids.memberA, (q) =>
      q(`insert into company_members (company_id, user_id, role) values ($1,$2,'owner')`, [companyA, ids.ownerB]))).rejects.toThrow(/row-level security/)
    const upd = await asUser(admin, ids.memberA, (q) => q(`update companies set name='hacked' where id=$1`, [companyA]))
    expect(upd.rowCount).toBe(0)
    const ok = await asUser(admin, ids.ownerA, (q) => q(`update companies set name='A Co 2' where id=$1`, [companyA]))
    expect(ok.rowCount).toBe(1)
  })

  it('refuses to remove the last owner', async () => {
    await expect(asUser(admin, ids.ownerA, (q) =>
      q(`delete from company_members where company_id=$1 and user_id=$2`, [companyA, ids.ownerA]))).rejects.toThrow(/last owner/)
  })

  it('alerts are visible only to their recipient', async () => {
    await admin.query(`insert into alerts (company_id, user_id, type, title, dedupe_key) values ($1,$2,'deadline','t','k1')`, [companyA, ids.memberA])
    expect((await asUser(admin, ids.memberA, (q) => q('select 1 from alerts'))).rows).toHaveLength(1)
    expect((await asUser(admin, ids.ownerA, (q) => q('select 1 from alerts'))).rows).toHaveLength(0)
  })

  it('activity log is append-only for users', async () => {
    await asUser(admin, ids.memberA, (q) => q(`insert into activity_log (company_id, actor_id, entity_type, action) values ($1,$2,'note','create')`, [companyA, ids.memberA]))
    await expect(asUser(admin, ids.memberA, (q) => q(`update activity_log set action='x'`))).rejects.toThrow(/permission denied/)
    await expect(asUser(admin, ids.memberA, (q) => q(`delete from activity_log`))).rejects.toThrow(/permission denied/)
    await expect(asUser(admin, ids.memberA, (q) =>
      q(`insert into activity_log (company_id, actor_id, entity_type, action) values ($1,$2,'note','forged')`, [companyA, ids.ownerA]))).rejects.toThrow(/row-level security/)
  })

  it('clients cannot write shared opportunity data', async () => {
    await expect(asUser(admin, ids.ownerA, (q) =>
      q(`insert into opportunities (source, notice_id, title) values ('SAM','evil','x')`))).rejects.toThrow(/row-level security/)
  })

  it('checklist PASS can only be set by a signed-in user, never the service role', async () => {
    await expect(asUser(admin, null, (q) =>
      q(`insert into checklist_items (company_id, company_opportunity_id, "group", key, label, status) values ($1,$2,'g','k','l','PASS')`, [companyA, coA]))).rejects.toThrow(/only be set by a user/)
    // service role may write UNKNOWN + an ai_suggestion
    await asUser(admin, null, (q) =>
      q(`insert into checklist_items (company_id, company_opportunity_id, "group", key, label, ai_suggestion) values ($1,$2,'g','k','l','{"status":"PASS"}')`, [companyA, coA]))
    const row = (await admin.query(`select status from checklist_items where key='k'`)).rows[0]
    expect(row.status).toBe('UNKNOWN')
    await expect(asUser(admin, null, (q) => q(`update checklist_items set status='PASS' where key='k'`))).rejects.toThrow(/only be set by a user/)
    await asUser(admin, ids.memberA, (q) => q(`update checklist_items set status='PASS' where key='k'`))
    expect((await admin.query(`select status, updated_by from checklist_items where key='k'`)).rows[0]).toEqual({ status: 'PASS', updated_by: ids.memberA })
  })

  it('moving to Submitted requires a manual confirmation note', async () => {
    await expect(asUser(admin, ids.memberA, (q) => q(`update company_opportunities set pipeline_stage='submitted' where id=$1`, [coA]))).rejects.toThrow(/confirmation note/)
    await asUser(admin, ids.memberA, (q) => q(`update company_opportunities set pipeline_stage='submitted', submitted_note='Submitted manually by me' where id=$1`, [coA]))
    expect((await admin.query(`select submitted_at is not null as ok from company_opportunities where id=$1`, [coA])).rows[0].ok).toBe(true)
  })

  it('rate limit allows up to the max then refuses', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 4; i++) results.push(await asUser(admin, ids.memberA, async (q) => (await q(`select check_rate_limit('t', 3, 60) as ok`)).rows[0].ok))
    expect(results).toEqual([true, true, true, false])
  })

  it('classification SQL function matches the rules', async () => {
    const f = async (code: string | null, active: boolean, cancelled: boolean, dl: string | null) =>
      (await admin.query(`select compute_color_label($1,$2,$3,$4::timestamptz) as l`, [code, active, cancelled, dl])).rows[0].l
    const future = new Date(Date.now() + 864e5).toISOString()
    const past = new Date(Date.now() - 864e5).toISOString()
    expect(await f('o', true, false, future)).toBe('GREEN')
    expect(await f('k', true, false, future)).toBe('GREEN')
    expect(await f('dibbs_rfq', true, false, future)).toBe('GREEN')
    expect(await f('o', true, false, null)).toBe('YELLOW')
    expect(await f('r', true, false, future)).toBe('YELLOW')
    expect(await f('p', true, false, null)).toBe('YELLOW')
    expect(await f('a', true, false, future)).toBe('RED')
    expect(await f('u', true, false, future)).toBe('RED')
    expect(await f('o', false, false, future)).toBe('RED')
    expect(await f('o', true, true, future)).toBe('RED')
    expect(await f('o', true, false, past)).toBe('RED')
  })

  it('maintains the full-text search vector', async () => {
    const r = await admin.query(`select 1 from opportunities where search_vector @@ plainto_tsquery('english','public')`)
    expect(r.rows.length).toBeGreaterThan(0)
  })
})

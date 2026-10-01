import { describe, expect, it } from 'vitest'
import { SamQuotaError, type SamClient } from './client'
import { runSamSync, type Cursor, type ExistingOpportunity, type RunPatch, type RunRecord, type SyncStore } from './sync'
import { availableSyncCalls, matchesAgency, matchesNaics, planTasks, planWindow } from './plan'
import { contentHash, diffTracked, alertTypeForDiff } from './hash'
import { normaliseOpportunity } from './normalise'
import { parseDeadline } from './time'
import { noticeCodeFromName } from './notice-types'
import type { NormalizedOpportunity, SamOpportunity, SamSearchParams } from './types'

const NOW = new Date('2026-10-01T15:00:00Z')

const sam = (id: string, over: Partial<SamOpportunity> = {}): SamOpportunity => ({
  noticeId: id,
  title: `Notice ${id}`,
  solicitationNumber: `SOL-${id}`,
  fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.W6QK ACC-RSA',
  postedDate: '2026-09-30',
  type: 'Solicitation',
  archiveDate: '2026-12-31',
  naicsCode: '336413',
  classificationCode: '1560',
  active: 'Yes',
  responseDeadLine: '2026-10-20T14:00:00-04:00',
  typeOfSetAside: 'SBA',
  typeOfSetAsideDescription: 'Total Small Business Set-Aside',
  resourceLinks: [`https://sam.gov/files/${id}-a.pdf`],
  pointOfContact: [{ fullName: 'A B', email: 'a@b.mil' }],
  placeOfPerformance: { city: { name: 'Huntsville' }, state: { code: 'AL' }, zip: '35898', country: { code: 'USA' } },
  ...over,
})

class FakeClient implements SamClient {
  calls: SamSearchParams[] = []
  constructor(private pages: (p: SamSearchParams) => { total: number; items: SamOpportunity[] } | Error) {}
  async search(p: SamSearchParams) {
    this.calls.push(p)
    const r = this.pages(p)
    if (r instanceof Error) throw r
    return { totalRecords: r.total, limit: p.limit, offset: p.offset, opportunitiesData: r.items }
  }
  async fetchDescription(): Promise<string> { throw new Error('unused') }
  async download(): Promise<never> { throw new Error('unused') }
}

class MemStore implements SyncStore {
  constructor() { this.targets = { naics: ['336413'], agencies: [] } }
  rows = new Map<string, ExistingOpportunity & NormalizedOpportunity>()
  amendments: Array<{ field: string; opportunity_id: string }> = []
  changed: Array<{ id: string; fields: string[] }> = []
  runs: RunRecord[] = []
  used = 0
  last: Date | null = null
  finalized = 0
  targets = { naics: [] as string[], agencies: [] as string[] }
  async callsUsedSince() { return this.used + this.runs.reduce((n, r) => n + r.calls_used, 0) }
  async lastSuccessfulSync() { return this.last }
  async getResumableRun() { return this.runs.find((r) => r.cursor && r.cursor.tasks.length) ?? null }
  async createRun(init: { cursor: Cursor }) {
    const r: RunRecord = { id: `run${this.runs.length + 1}`, cursor: init.cursor, found: 0, inserted: 0, updated: 0, calls_used: 0, errors: [] }
    this.runs.push(r)
    return r
  }
  async updateRun(id: string, patch: RunPatch) {
    const r = this.runs.find((x) => x.id === id)!
    Object.assign(r, patch)
    if (patch.status === 'complete') this.last = NOW
  }
  async getTargets() { return this.targets }
  async getExisting(ids: string[]) {
    return new Map(ids.filter((i) => this.rows.has(i)).map((i) => [i, this.rows.get(i)!]))
  }
  async insertOpportunities(rows: NormalizedOpportunity[]) { rows.forEach((r, i) => this.rows.set(r.notice_id, { ...r, id: `id-${r.notice_id}-${i}` })) }
  async updateOpportunity(id: string, row: NormalizedOpportunity) { this.rows.set(row.notice_id, { ...row, id }) }
  async insertAmendments(rows: Array<{ field: string; opportunity_id: string }>) { this.amendments.push(...rows) }
  async onChanged(id: string, _r: NormalizedOpportunity, diffs: { field: string }[]) { this.changed.push({ id, fields: diffs.map((d) => d.field) }) }
  async finalize() { this.finalized++ }
}

const cfg = { dailyQuota: 10, reserved: 2, now: NOW }

describe('plan helpers', () => {
  it('reserves on-demand calls from the daily budget', () => {
    expect(availableSyncCalls({ dailyQuota: 10, reserved: 2, usedToday: 0 })).toBe(8)
    expect(availableSyncCalls({ dailyQuota: 10, reserved: 2, usedToday: 8 })).toBe(0)
    expect(availableSyncCalls({ dailyQuota: 10, reserved: 2, usedToday: 9 })).toBe(0)
  })
  it('applies a 2-day overlap to the last successful sync and caps at 1 year', () => {
    const w = planWindow({ lastSuccessfulSyncAt: new Date('2026-09-29T08:00:00Z'), now: NOW })
    expect(w.from.toISOString().slice(0, 10)).toBe('2026-09-27')
    expect(w.to.toISOString().slice(0, 10)).toBe('2026-10-01')
    const old = planWindow({ lastSuccessfulSyncAt: new Date('2020-01-01T00:00:00Z'), now: NOW })
    expect((old.to.getTime() - old.from.getTime()) / 864e5).toBeLessThanOrEqual(365)
  })
  it('first sync looks back 14 days', () => {
    const w = planWindow({ lastSuccessfulSyncAt: null, now: NOW })
    expect((w.to.getTime() - w.from.getTime()) / 864e5).toBe(14)
  })
  it('chooses per-NAICS calls only when they fit the budget, else sweeps', () => {
    expect(planTasks(['336413', '541330'], 8).mode).toBe('per_naics')
    expect(planTasks(['336413', '541330'], 8).tasks).toHaveLength(2)
    expect(planTasks(['1', '2', '3'], 2).mode).toBe('sweep')
    expect(planTasks([], 8).mode).toBe('sweep')
  })
  it('matches naics prefixes and agencies locally', () => {
    expect(matchesNaics('336413', ['3364'])).toBe(true)
    expect(matchesNaics(null, ['3364'])).toBe(false)
    expect(matchesNaics(null, [])).toBe(true)
    expect(matchesAgency('DEPT OF DEFENSE.ARMY', ['defense'])).toBe(true)
    expect(matchesAgency('DEPT OF ENERGY', ['defense'])).toBe(false)
  })
})

describe('normalisation', () => {
  it('maps SAM fields, notice type codes and agency path', () => {
    const n = normaliseOpportunity(sam('1'), NOW)
    expect(n.department).toBe('DEPT OF DEFENSE')
    expect(n.sub_tier).toBe('DEPT OF THE ARMY')
    expect(n.office).toBe('W6QK ACC-RSA')
    expect(n.notice_type_code).toBe('o')
    expect(n.response_deadline).toBe('2026-10-20T18:00:00.000Z')
    expect(n.pop_state).toBe('AL')
    expect(n.active).toBe(true)
  })
  it('treats active "No" and past archive dates as inactive', () => {
    expect(normaliseOpportunity(sam('2', { active: 'No' }), NOW).active).toBe(false)
    expect(normaliseOpportunity(sam('3', { archiveDate: '2026-09-01' }), NOW).active).toBe(false)
  })
  it('derives notice codes from names', () => {
    expect(noticeCodeFromName('Combined Synopsis/Solicitation')).toBe('k')
    expect(noticeCodeFromName('Solicitation')).toBe('o')
    expect(noticeCodeFromName('Award Notice')).toBe('a')
    expect(noticeCodeFromName('Sources Sought')).toBe('r')
    expect(noticeCodeFromName('Justification')).toBe('u')
    expect(noticeCodeFromName('Intent to Bundle Requirements (DoD-Funded)')).toBe('i')
    expect(noticeCodeFromName('weird')).toBeNull()
  })
  it('handles date-only and zone-less deadlines without marking them past early', () => {
    const d = parseDeadline('2026-10-05')
    expect(d.hasTime).toBe(false)
    expect(new Date(d.iso!).getTime()).toBeGreaterThan(new Date('2026-10-05T23:59:59Z').getTime() - 1)
    expect(parseDeadline('2026-10-05T12:00:00-04:00').iso).toBe('2026-10-05T16:00:00.000Z')
    expect(parseDeadline(null).iso).toBeNull()
    expect(parseDeadline('garbage').iso).toBeNull()
  })
})

describe('content hash & amendment diffs', () => {
  it('is stable for identical content and changes with tracked fields', () => {
    const a = normaliseOpportunity(sam('1'), NOW)
    const b = normaliseOpportunity(sam('1'), NOW)
    expect(a.content_hash).toBe(b.content_hash)
    expect(normaliseOpportunity(sam('1', { responseDeadLine: '2026-10-25T14:00:00-04:00' }), NOW).content_hash).not.toBe(a.content_hash)
  })
  it('ignores untracked noise (e.g. posted date order of links)', () => {
    const a = normaliseOpportunity(sam('1', { resourceLinks: ['x', 'y'] }), NOW)
    const b = normaliseOpportunity(sam('1', { resourceLinks: ['y', 'x'] }), NOW)
    expect(a.content_hash).toBe(b.content_hash)
  })
  it('produces field-level diffs and maps them to alert types', () => {
    const a = normaliseOpportunity(sam('1'), NOW)
    const b = normaliseOpportunity(sam('1', { responseDeadLine: '2026-10-25T14:00:00-04:00', resourceLinks: ['https://sam.gov/files/1-a.pdf', 'https://sam.gov/files/1-b.pdf'], title: 'New title' }), NOW)
    const diffs = diffTracked(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>)
    expect(diffs.map((d) => d.field).sort()).toEqual(['resource_links', 'response_deadline', 'title'])
    const types = Object.fromEntries(diffs.map((d) => [d.field, alertTypeForDiff(d)]))
    expect(types).toEqual({ response_deadline: 'deadline_changed', resource_links: 'new_attachment', title: 'amendment' })
    expect(contentHash(a as unknown as Record<string, unknown>)).toBe(a.content_hash)
  })
})

describe('runSamSync', () => {
  it('inserts new notices, classifies them, and completes in one call', async () => {
    const store = new MemStore()
    const client = new FakeClient(() => ({ total: 2, items: [sam('1'), sam('2', { type: 'Award Notice' })] }))
    const r = await runSamSync(client, store, cfg)
    expect(r).toMatchObject({ status: 'complete', callsUsed: 1, found: 2, inserted: 2, updated: 0 })
    expect(store.rows.size).toBe(2)
    expect((store.rows.get('1') as unknown as { color_label: string }).color_label).toBe('GREEN')
    expect((store.rows.get('2') as unknown as { color_label: string }).color_label).toBe('RED')
    expect(store.finalized).toBe(1)
    expect(client.calls[0].limit).toBe(1000)
    expect(client.calls[0].postedFrom).toBe('09/17/2026') // first sync: 14-day window
  })

  it('on re-sync updates only changed notices, writes amendments + notifies', async () => {
    const store = new MemStore()
    await runSamSync(new FakeClient(() => ({ total: 2, items: [sam('1'), sam('2')] })), store, cfg)
    store.runs[0].cursor = null
    const r = await runSamSync(new FakeClient(() => ({ total: 2, items: [sam('1'), sam('2', { responseDeadLine: '2026-10-30T14:00:00-04:00' })] })), store, { ...cfg, now: new Date('2026-10-02T15:00:00Z') })
    expect(r).toMatchObject({ inserted: 0, updated: 1 })
    expect(store.amendments.map((a) => a.field)).toEqual(['response_deadline'])
    expect(store.changed).toHaveLength(1)
    expect(store.changed[0].fields).toEqual(['response_deadline'])
  })

  it('uses the overlap window after a successful sync', async () => {
    const store = new MemStore()
    store.last = new Date('2026-09-30T10:00:00Z')
    const client = new FakeClient(() => ({ total: 0, items: [] }))
    await runSamSync(client, store, cfg)
    expect(client.calls[0].postedFrom).toBe('09/28/2026')
    expect(client.calls[0].postedTo).toBe('10/01/2026')
  })

  it('queries each NAICS when budget allows, and pages by total records', async () => {
    const store = new MemStore()
    store.targets = { naics: ['336413', '541330'], agencies: [] }
    const client = new FakeClient((p) => {
      if (p.ncode === '336413') return { total: 1500, items: [sam(`a${p.offset}`)] }
      return { total: 1, items: [sam('b1', { naicsCode: '541330' })] }
    })
    const r = await runSamSync(client, store, cfg)
    expect(client.calls.map((c) => `${c.ncode}:${c.offset}`)).toEqual(['336413:0', '336413:1', '541330:0'])
    expect(r.status).toBe('complete')
    expect(r.callsUsed).toBe(3)
  })

  it('sweeps and filters locally when there are too many NAICS for the budget', async () => {
    const store = new MemStore()
    store.targets = { naics: ['336413'], agencies: [] }
    store.used = 7 // 1 sync call left
    const client = new FakeClient(() => ({ total: 2, items: [sam('keep'), sam('drop', { naicsCode: '999999' })] }))
    // one NAICS fits in 1 call -> per_naics; force sweep by 2 NAICS with 1 call left
    store.targets = { naics: ['336413', '541330'], agencies: [] }
    const r = await runSamSync(client, store, cfg)
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].ncode).toBeUndefined()
    expect(r.found).toBe(2)
    expect([...store.rows.keys()]).toEqual(['keep'])
  })

  it('never spends the reserved on-demand calls', async () => {
    const store = new MemStore()
    store.used = 8
    const client = new FakeClient(() => ({ total: 0, items: [] }))
    const r = await runSamSync(client, store, cfg)
    expect(r.status).toBe('quota_exhausted')
    expect(client.calls).toHaveLength(0)
    expect(r.nextAllowedAt?.toISOString()).toBe('2026-10-02T00:00:00.000Z')
  })

  it('stops gracefully on 429, records next allowed time and a resumable cursor', async () => {
    const store = new MemStore()
    store.targets = { naics: ['336413', '541330'], agencies: [] }
    const next = new Date('2026-10-02T00:00:00Z')
    let n = 0
    const client = new FakeClient((p) => (++n === 2 ? new SamQuotaError(next, 'quota') : { total: 1, items: [sam(`n${p.ncode}`)] }))
    const r = await runSamSync(client, store, cfg)
    expect(r.status).toBe('quota_exhausted')
    expect(r.nextAllowedAt).toEqual(next)
    expect(store.runs[0].cursor?.tasks).toEqual([{ ncode: '541330', page: 0 }])
    expect((store.runs[0] as RunRecord & { status?: string }).status).toBe('quota_exhausted')
    // resume next day picks up the remaining task, same window
    store.used = 0
    const client2 = new FakeClient(() => ({ total: 1, items: [sam('late', { naicsCode: '541330' })] }))
    const r2 = await runSamSync(client2, store, { ...cfg, now: new Date('2026-10-02T01:00:00Z') })
    expect(client2.calls.map((c) => c.ncode)).toEqual(['541330'])
    expect(r2.status).toBe('complete')
    expect(store.runs).toHaveLength(2) // one row per invocation; cursor moved to the new row
    expect(store.runs[0].cursor).toBeNull()
  })

  it('skips (spends no calls) when no company has NAICS codes configured', async () => {
    const store = new MemStore()
    store.targets = { naics: [], agencies: [] }
    const client = new FakeClient(() => ({ total: 0, items: [] }))
    expect((await runSamSync(client, store, cfg)).status).toBe('skipped')
    expect(client.calls).toHaveLength(0)
  })

  it('retries a failing task up to three times, then drops it', async () => {
    const store = new MemStore()
    const client = new FakeClient(() => new Error('boom'))
    for (let i = 0; i < 3; i++) await runSamSync(client, store, cfg)
    const last = store.runs[store.runs.length - 1]
    expect(last.cursor === null || last.cursor.tasks.length === 0).toBe(true)
    expect(store.runs.flatMap((r) => r.errors)).toHaveLength(3)
    expect(client.calls).toHaveLength(3)
  })
})

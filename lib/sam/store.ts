import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyOpportunityChange } from '@/lib/alerts-db'
import type { FieldDiff } from './hash'
import { TRACKED_FIELDS } from './hash'
import type { Cursor, ExistingOpportunity, RunPatch, RunRecord, SyncStore } from './sync'
import type { NormalizedOpportunity } from './types'

type Admin = ReturnType<typeof createAdminClient>
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n))

/** Supabase-backed SyncStore. Service role: only ever used from cron / authenticated server routes. */
export function createSupabaseSyncStore(admin: Admin = createAdminClient()): SyncStore {
  const mapRun = (r: any): RunRecord => ({ id: r.id, cursor: (r.cursor as Cursor | null) ?? null, found: r.found, inserted: r.inserted, updated: r.updated, calls_used: r.calls_used, errors: r.errors ?? [] })
  return {
    async callsUsedSince(since) {
      const { data, error } = await admin.from('sync_runs').select('calls_used').eq('source', 'SAM').gte('started_at', since.toISOString())
      if (error) throw error
      return (data ?? []).reduce((n, r) => n + (r.calls_used ?? 0), 0)
    },
    async lastSuccessfulSync() {
      const { data } = await admin.from('sync_runs').select('finished_at').eq('source', 'SAM').eq('purpose', 'sync').eq('status', 'complete').order('finished_at', { ascending: false }).limit(1)
      return data?.[0]?.finished_at ? new Date(data[0].finished_at) : null
    },
    async getResumableRun() {
      const { data } = await admin.from('sync_runs').select('*').eq('source', 'SAM').eq('purpose', 'sync').not('cursor', 'is', null).order('started_at', { ascending: false }).limit(1)
      return data?.[0] ? mapRun(data[0]) : null
    },
    async createRun(init) {
      const { data, error } = await admin.from('sync_runs').insert({ source: 'SAM', purpose: 'sync', window_from: init.windowFrom, window_to: init.windowTo, cursor: init.cursor, status: 'running' }).select('*').single()
      if (error) throw error
      return mapRun(data)
    },
    async updateRun(id, patch: RunPatch) {
      const { error } = await admin.from('sync_runs').update(patch).eq('id', id)
      if (error) throw error
    },
    async getTargets() {
      const { data } = await admin.from('companies').select('naics_codes, target_agencies')
      const rows = data ?? []
      const naics = [...new Set(rows.flatMap((r) => r.naics_codes ?? []))]
      // Agency filter applies only if EVERY company narrowed it; otherwise someone wants everything.
      const agencies = rows.length > 0 && rows.every((r) => (r.target_agencies ?? []).length > 0) ? [...new Set(rows.flatMap((r) => r.target_agencies))] : []
      return { naics, agencies }
    },
    async getExisting(ids) {
      const map = new Map<string, ExistingOpportunity>()
      for (const part of chunk(ids, 200)) {
        const { data, error } = await admin.from('opportunities').select(['id', 'notice_id', 'content_hash', ...TRACKED_FIELDS].join(',')).eq('source', 'SAM').is('company_id', null).in('notice_id', part)
        if (error) throw error
        for (const r of (data ?? []) as unknown as Array<ExistingOpportunity & { notice_id: string }>) map.set(r.notice_id, r)
      }
      return map
    },
    async insertOpportunities(rows) {
      for (const part of chunk(rows, 200)) {
        const { error } = await admin.from('opportunities').insert(part.map(({ raw, ...r }) => ({ ...r, raw, last_seen_at: new Date().toISOString() })))
        if (error) throw error
      }
    },
    async updateOpportunity(id, row) {
      const { error } = await admin.from('opportunities').update({ ...row, last_seen_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    async insertAmendments(rows) {
      if (!rows.length) return
      const { error } = await admin.from('opportunity_amendments').insert(rows)
      if (error) throw error
    },
    async onChanged(opportunityId: string, row: NormalizedOpportunity, diffs: FieldDiff[]) {
      await notifyOpportunityChange(admin, { opportunityId, title: row.title, contentHash: row.content_hash, diffs })
    },
    async finalize() {
      await admin.rpc('refresh_color_labels')
      await admin.rpc('deactivate_archived')
    },
  }
}

/** Records calls made outside the scheduled sync (descriptions, downloads) so quota accounting stays exact. */
export async function recordOnDemandCalls(admin: Admin, calls: number, note: string, error?: string) {
  const now = new Date().toISOString()
  await admin.from('sync_runs').insert({ source: 'SAM', purpose: 'on_demand', calls_used: calls, started_at: now, finished_at: now, status: error ? 'error' : 'complete', errors: error ? [{ kind: 'on_demand', note, message: error }] : [] })
}

export async function samCallsUsedToday(admin: Admin, now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const { data } = await admin.from('sync_runs').select('calls_used').eq('source', 'SAM').gte('started_at', start.toISOString())
  return (data ?? []).reduce((n, r) => n + (r.calls_used ?? 0), 0)
}

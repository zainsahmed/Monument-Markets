import { classifyNormalised, normaliseOpportunity } from './normalise'
import { diffTracked, type FieldDiff } from './hash'
import { availableSyncCalls, matchesAgency, matchesNaics, nextQuotaReset, planTasks, planWindow, SAM_MAX_LIMIT, startOfUtcDay, type SyncMode, type Task } from './plan'
import { SamQuotaError, type SamClient } from './client'
import { formatSamDate } from './time'
import type { NormalizedOpportunity } from './types'

export interface ExistingOpportunity extends Record<string, unknown> {
  id: string
  content_hash: string | null
}
export interface Cursor {
  mode: SyncMode
  window: { from: string; to: string }
  tasks: Array<Task & { attempts?: number }>
}
export interface RunRecord {
  id: string
  cursor: Cursor | null
  found: number
  inserted: number
  updated: number
  calls_used: number
  errors: unknown[]
}
export interface RunPatch {
  finished_at?: string | null
  calls_used?: number
  found?: number
  inserted?: number
  updated?: number
  errors?: unknown[]
  status?: 'running' | 'complete' | 'partial' | 'quota_exhausted' | 'error'
  cursor?: Cursor | null
  next_allowed_at?: string | null
}

/** Persistence boundary; Supabase implementation in lib/sam/store.ts, in-memory one in tests. */
export interface SyncStore {
  callsUsedSince(since: Date): Promise<number>
  lastSuccessfulSync(): Promise<Date | null>
  getResumableRun(): Promise<RunRecord | null>
  createRun(init: { windowFrom: string; windowTo: string; cursor: Cursor }): Promise<RunRecord>
  updateRun(id: string, patch: RunPatch): Promise<void>
  getTargets(): Promise<{ naics: string[]; agencies: string[] }>
  getExisting(noticeIds: string[]): Promise<Map<string, ExistingOpportunity>>
  insertOpportunities(rows: Array<NormalizedOpportunity & { color_label: string }>): Promise<void>
  updateOpportunity(id: string, row: NormalizedOpportunity & { color_label: string }): Promise<void>
  insertAmendments(rows: Array<{ opportunity_id: string; field: string; old_value: unknown; new_value: unknown; sync_run_id: string }>): Promise<void>
  onChanged(opportunityId: string, row: NormalizedOpportunity, diffs: FieldDiff[]): Promise<void>
  finalize(): Promise<void>
}

export interface SyncConfig {
  dailyQuota: number
  reserved: number
  now?: Date
}
export interface SyncResult {
  status: 'complete' | 'partial' | 'quota_exhausted' | 'error' | 'skipped'
  callsUsed: number
  found: number
  inserted: number
  updated: number
  errors: unknown[]
  nextAllowedAt: Date | null
  runId: string | null
}

const MAX_ATTEMPTS = 3

export async function runSamSync(client: SamClient, store: SyncStore, cfg: SyncConfig): Promise<SyncResult> {
  const now = cfg.now ?? new Date()
  const usedToday = await store.callsUsedSince(startOfUtcDay(now))
  const budget = { dailyQuota: cfg.dailyQuota, reserved: cfg.reserved, usedToday }
  const available = availableSyncCalls(budget)

  const resumable = await store.getResumableRun()
  if (available <= 0) {
    // Nothing to spend; do not create noise rows. The dashboard derives the banner from usage + quota.
    return { status: 'quota_exhausted', callsUsed: 0, found: 0, inserted: 0, updated: 0, errors: [], nextAllowedAt: nextQuotaReset(now), runId: resumable?.id ?? null }
  }

  const targets = await store.getTargets()
  let run: RunRecord
  let cursor: Cursor
  if (resumable?.cursor && resumable.cursor.tasks.length > 0) {
    run = resumable
    cursor = resumable.cursor
  } else {
    const win = planWindow({ lastSuccessfulSyncAt: await store.lastSuccessfulSync(), now })
    const plan = planTasks(targets.naics, available)
    cursor = { mode: plan.mode, window: { from: win.from.toISOString(), to: win.to.toISOString() }, tasks: plan.tasks }
    run = await store.createRun({ windowFrom: cursor.window.from.slice(0, 10), windowTo: cursor.window.to.slice(0, 10), cursor })
  }

  let calls = 0
  let found = run.found, inserted = run.inserted, updated = run.updated
  const errors: unknown[] = [...run.errors]
  let status: SyncResult['status'] = 'complete'
  let nextAllowedAt: Date | null = null
  const queue = [...cursor.tasks]

  while (queue.length > 0) {
    if (calls >= available) { status = 'partial'; break }
    const task = queue[0]
    try {
      const res = await client.search({
        postedFrom: formatSamDate(new Date(cursor.window.from)),
        postedTo: formatSamDate(new Date(cursor.window.to)),
        limit: SAM_MAX_LIMIT,
        offset: task.page,
        ...(task.ncode ? { ncode: task.ncode } : {}),
      })
      calls++
      queue.shift()
      found += res.opportunitiesData.length
      const normalised = res.opportunitiesData
        .filter((o) => o?.noticeId)
        .map((o) => normaliseOpportunity(o, now))
        .filter((o) => matchesNaics(o.naics, cursor.mode === 'sweep' ? targets.naics : []) && matchesAgency(o.full_parent_path, targets.agencies))
      const r = await upsertBatch(store, normalised, run.id, now)
      inserted += r.inserted
      updated += r.updated
      if ((task.page + 1) * SAM_MAX_LIMIT < res.totalRecords) queue.unshift({ ncode: task.ncode, page: task.page + 1 })
    } catch (e) {
      if (e instanceof SamQuotaError) {
        calls++ // the rejected call still counts against the key
        status = 'quota_exhausted'
        nextAllowedAt = e.nextAllowedAt
        errors.push({ at: now.toISOString(), kind: 'quota', message: e.message })
        break
      }
      calls++
      const attempts = (task.attempts ?? 0) + 1
      errors.push({ at: now.toISOString(), kind: 'http', task, message: e instanceof Error ? e.message : String(e) })
      if (attempts >= MAX_ATTEMPTS) queue.shift()
      else queue[0] = { ...task, attempts }
      status = 'error'
      break
    }
  }

  const remaining = queue.length > 0
  if (!remaining && status !== 'error') status = 'complete'
  if (remaining && status === 'complete') status = 'partial'
  const finished = !remaining
  await store.updateRun(run.id, {
    calls_used: run.calls_used + calls,
    found, inserted, updated, errors,
    status: finished ? (status === 'error' ? 'complete' : status) : status,
    finished_at: finished ? now.toISOString() : null,
    cursor: finished ? null : { ...cursor, tasks: queue },
    next_allowed_at: nextAllowedAt ? nextAllowedAt.toISOString() : null,
  })
  await store.finalize()
  return { status, callsUsed: calls, found, inserted, updated, errors, nextAllowedAt, runId: run.id }
}

export async function upsertBatch(store: SyncStore, rows: NormalizedOpportunity[], runId: string, now: Date) {
  if (rows.length === 0) return { inserted: 0, updated: 0 }
  // De-dupe within the batch (overlap windows can repeat a notice id).
  const unique = [...new Map(rows.map((r) => [r.notice_id, r])).values()]
  const existing = await store.getExisting(unique.map((r) => r.notice_id))
  const toInsert: Array<NormalizedOpportunity & { color_label: string }> = []
  let updated = 0
  for (const row of unique) {
    const withLabel = { ...row, color_label: classifyNormalised(row, now).label }
    const prev = existing.get(row.notice_id)
    if (!prev) { toInsert.push(withLabel); continue }
    if (prev.content_hash === row.content_hash) continue
    const diffs = diffTracked(prev, row as unknown as Record<string, unknown>)
    await store.updateOpportunity(prev.id, withLabel)
    if (diffs.length > 0) {
      await store.insertAmendments(diffs.map((d) => ({ opportunity_id: prev.id, field: d.field, old_value: d.old, new_value: d.new, sync_run_id: runId })))
      await store.onChanged(prev.id, row, diffs)
    }
    updated++
  }
  if (toInsert.length) await store.insertOpportunities(toInsert)
  return { inserted: toInsert.length, updated }
}

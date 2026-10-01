import { daysLeft } from './format'
import { PIPELINE_STAGES } from './db-types'

/** Dashboard maths (pure, tested). Potential value counts KNOWN values only and says how many are unknown. */
export interface TrackedRow {
  coId: string
  oppId: string
  title: string
  department: string | null
  deadline: string | null
  color: 'GREEN' | 'YELLOW' | 'RED'
  active: boolean
  value: number | null
  workflow: 'pursue' | 'review' | 'pass' | 'none'
  stage: string | null
  saved: boolean
  aiFit: string | null
}

const OPEN_STAGES = PIPELINE_STAGES.map((s) => s.key).filter((k) => !['won', 'lost_passed'].includes(k))

export const isPursued = (r: TrackedRow) => r.workflow === 'pursue' || (r.stage !== null && OPEN_STAGES.includes(r.stage as never) && r.stage !== 'new')
const isOpen = (r: TrackedRow) => r.active && (r.deadline === null || new Date(r.deadline).getTime() > Date.now())

export function dashboardMetrics(rows: TrackedRow[], now = new Date()) {
  const pursued = rows.filter(isPursued)
  const known = pursued.filter((r) => r.value !== null && r.value > 0)
  const within = (r: TrackedRow, n: number) => { const d = daysLeft(r.deadline, now); return d !== null && d > 0 && d <= n }
  return {
    beingPursued: pursued.length,
    potentialValue: known.reduce((a, r) => a + (r.value as number), 0),
    unknownValueCount: pursued.length - known.length,
    deadlines7: rows.filter((r) => r.workflow !== 'pass' && r.stage !== 'won' && r.stage !== 'lost_passed' && (r.saved || isPursued(r) || r.stage) && within(r, 7)).length,
  }
}

export type PanelKey = 'needsReview' | 'highPriority' | 'deadlines' | 'sourcing' | 'ready' | 'submitted' | 'won' | 'lostPassed'
export function dashboardPanels(rows: TrackedRow[], now = new Date()): Record<PanelKey, TrackedRow[]> {
  const byDeadline = (a: TrackedRow, b: TrackedRow) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
  const live = rows.filter((r) => r.workflow !== 'pass')
  return {
    needsReview: live.filter((r) => r.workflow === 'review' || r.stage === 'new' || r.stage === 'reviewing').sort(byDeadline),
    highPriority: live.filter((r) => r.aiFit === 'High' && isOpen(r) && r.stage !== 'won' && r.stage !== 'lost_passed' && r.stage !== 'submitted').sort(byDeadline),
    deadlines: live.filter((r) => { const d = daysLeft(r.deadline, now); return d !== null && d > 0 && d <= 14 && r.stage !== 'won' && r.stage !== 'lost_passed' && r.stage !== 'submitted' && (r.saved || !!r.stage || r.workflow === 'pursue') }).sort(byDeadline),
    sourcing: live.filter((r) => r.stage === 'sourcing').sort(byDeadline),
    ready: live.filter((r) => r.stage === 'ready_to_bid').sort(byDeadline),
    submitted: rows.filter((r) => r.stage === 'submitted'),
    won: rows.filter((r) => r.stage === 'won'),
    lostPassed: rows.filter((r) => r.stage === 'lost_passed' || r.workflow === 'pass'),
  }
}

export function stageCounts(rows: Array<{ stage: string | null }>) {
  return PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label, count: rows.filter((r) => r.stage === s.key).length }))
}

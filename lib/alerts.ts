import { daysLeft } from './format'

/** Alert rules (spec §14). Pure; DB writes live in lib/alerts-db.ts. */
export type AlertType = 'new_match' | 'deadline' | 'amendment' | 'new_attachment' | 'deadline_changed' | 'text_changed' | 'quote_received' | 'quote_expiring' | 'status_changed'
export const ALERT_TYPES: Array<{ type: AlertType; label: string }> = [
  { type: 'new_match', label: 'New opportunity matches a saved search' },
  { type: 'deadline', label: 'Deadline approaching' },
  { type: 'amendment', label: 'Amendment detected' },
  { type: 'new_attachment', label: 'New attachment' },
  { type: 'deadline_changed', label: 'Deadline changed' },
  { type: 'text_changed', label: 'Solicitation text changed' },
  { type: 'quote_received', label: 'Supplier quote received' },
  { type: 'quote_expiring', label: 'Supplier quote expiring' },
  { type: 'status_changed', label: 'Status changed' },
]
export const DEFAULT_OFFSETS = [7, 3, 1]
/** Which detail-page tab each alert type points at. */
export const ALERT_TAB: Record<AlertType, string> = {
  new_match: 'overview', deadline: 'overview', amendment: 'activity', new_attachment: 'documents', deadline_changed: 'activity',
  text_changed: 'activity', quote_received: 'suppliers', quote_expiring: 'suppliers', status_changed: 'activity',
}

export interface DeadlineCandidate { userId: string; companyId: string; opportunityId: string; title: string; deadline: string; offsets: number[] }
export interface PlannedAlert { dedupeKey: string; userId: string; companyId: string; opportunityId: string; type: AlertType; title: string; payload: Record<string, unknown> }

/**
 * For each candidate fire at most ONE deadline alert — the tightest offset already reached (e.g. 2 days left
 * with offsets 7/3/1 fires the "3 days" alert). The dedupe key includes the deadline, so a changed deadline re-arms.
 */
export function planDeadlineAlerts(c: DeadlineCandidate[], now = new Date()): PlannedAlert[] {
  const out: PlannedAlert[] = []
  for (const x of c) {
    const d = daysLeft(x.deadline, now)
    if (d === null || d <= 0) continue
    const reached = [...x.offsets].sort((a, b) => a - b).find((o) => d <= o)
    if (reached === undefined) continue
    out.push({
      dedupeKey: `deadline:${x.userId}:${x.opportunityId}:${reached}:${new Date(x.deadline).toISOString().slice(0, 10)}`,
      userId: x.userId, companyId: x.companyId, opportunityId: x.opportunityId, type: 'deadline',
      title: `${d === 1 ? 'Due within 1 day' : `Due in ${d} days`}: ${x.title}`, payload: { days_left: d, offset: reached, deadline: x.deadline },
    })
  }
  return out
}

export const changeKey = (type: AlertType, userId: string, opportunityId: string, token: string) => `${type}:${userId}:${opportunityId}:${token}`

export interface DigestAlert { title: string; type: AlertType; link: string; created_at: string }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function renderDigest(alerts: DigestAlert[], appUrl: string): { subject: string; html: string; text: string } {
  const subject = alerts.length === 1 ? `Fieldpoint: ${alerts[0].title}` : `Fieldpoint: ${alerts.length} updates on your opportunities`
  const rows = alerts.map((a) => `<li style="margin:0 0 8px"><a href="${esc(appUrl + a.link)}" style="color:#0A58C6;text-decoration:none">${esc(a.title)}</a></li>`).join('')
  const html = `<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;font-size:15px;color:#1D1D1F"><p style="font-size:20px;font-weight:600;margin:0 0 12px">Fieldpoint</p><ul style="padding-left:18px;margin:0 0 16px">${rows}</ul><p style="color:#636366;font-size:12px">Fieldpoint is a research tool. It never contacts the government or submits bids on your behalf.</p></div>`
  const text = alerts.map((a) => `- ${a.title}\n  ${appUrl}${a.link}`).join('\n') + '\n'
  return { subject, html, text }
}

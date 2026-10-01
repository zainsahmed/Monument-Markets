import { CalendarClock } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Metric } from '@/components/app/Metric'
import { CountdownChip, ColorPill } from '@/components/ui/chips'
import { Empty, PageHeader } from '@/components/ui/states'
import { requirePageSession } from '@/lib/auth'
import { syncStatus } from '@/lib/data/dashboard'
import { dashboardMetrics, dashboardPanels, stageCounts, type PanelKey, type TrackedRow } from '@/lib/dashboard-calc'
import { daysLeft, fmtDate, timeAgo } from '@/lib/format'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

const PANELS: Array<{ key: PanelKey | 'new'; title: string; href: string; empty: string }> = [
  { key: 'new', title: 'New', href: '/opportunities?tab=bid_ready', empty: 'Nothing new in the last 7 days.' },
  { key: 'needsReview', title: 'Needs review', href: '/pipeline', empty: 'Nothing is waiting on your review.' },
  { key: 'highPriority', title: 'High priority', href: '/opportunities?saved=1', empty: 'Run an AI brief to surface high-fit opportunities.' },
  { key: 'deadlines', title: 'Deadlines approaching', href: '/opportunities?saved=1', empty: 'No tracked deadlines in the next 14 days.' },
  { key: 'sourcing', title: 'Sourcing', href: '/pipeline', empty: 'No opportunities in Sourcing.' },
  { key: 'ready', title: 'Ready to bid', href: '/pipeline', empty: 'Nothing is ready to bid yet.' },
  { key: 'submitted', title: 'Submitted', href: '/pipeline', empty: 'Nothing submitted yet.' },
  { key: 'won', title: 'Won', href: '/pipeline', empty: 'No wins recorded yet.' },
  { key: 'lostPassed', title: 'Lost / passed', href: '/pipeline', empty: 'Nothing passed or lost.' },
]

export default async function Dashboard() {
  const s = await requirePageSession()
  const now = new Date()
  const iso30 = new Date(now.getTime() - 30 * 864e5).toISOString()
  const iso7 = new Date(now.getTime() - 7 * 864e5).toISOString()
  const in30 = new Date(now.getTime() + 30 * 864e5).toISOString()

  const [tracked, newOnes, foundRuns, stored, timeline, status] = await Promise.all([
    s.supabase.from('company_opportunities').select('id, opportunity_id, workflow_status, pipeline_stage, saved, ai_fit, opp:opportunities(id, title, department, response_deadline, color_label, active, value_amount)'),
    s.supabase.from('opportunities').select('id, title, department, response_deadline, color_label').in('color_label', ['GREEN', 'YELLOW']).eq('active', true).gt('created_at', iso7).order('created_at', { ascending: false }).limit(5),
    s.supabase.from('sync_runs').select('found').eq('source', 'SAM').eq('purpose', 'sync').gt('started_at', iso30),
    s.supabase.from('opportunities').select('id', { count: 'exact', head: true }).gt('created_at', iso30),
    s.supabase.from('opportunities').select('id, title, response_deadline, color_label').eq('color_label', 'GREEN').gt('response_deadline', now.toISOString()).lt('response_deadline', in30).order('response_deadline').limit(300),
    syncStatus(s),
  ])
  const rows: TrackedRow[] = (tracked.data ?? []).map((r: any) => ({
    coId: r.id, oppId: r.opportunity_id, title: r.opp?.title ?? 'Unknown', department: r.opp?.department ?? null, deadline: r.opp?.response_deadline ?? null,
    color: r.opp?.color_label ?? 'YELLOW', active: r.opp?.active ?? true, value: r.opp?.value_amount ?? null, workflow: r.workflow_status, stage: r.pipeline_stage, saved: r.saved, aiFit: r.ai_fit,
  }))
  const m = dashboardMetrics(rows, now)
  const panels = dashboardPanels(rows, now)
  const found = (foundRuns.data ?? []).reduce((n, r) => n + (r.found ?? 0), 0)
  const afterFilter = stored.count ?? 0
  const needsReview = panels.needsReview.length
  const stages = stageCounts(rows)
  const totalStage = stages.reduce((n, x) => n + x.count, 0)

  // 30-day strip
  const dots = [...(timeline.data ?? []).map((o) => ({ id: o.id, title: o.title, deadline: o.response_deadline as string })), ...rows.filter((r) => r.deadline && daysLeft(r.deadline, now)! > 0 && daysLeft(r.deadline, now)! <= 30 && !(timeline.data ?? []).some((t) => t.id === r.oppId)).map((r) => ({ id: r.oppId, title: r.title, deadline: r.deadline as string }))]

  return (
    <>
      <PageHeader title="Dashboard" subtitle={<>Last synced {timeAgo(status.lastSyncedAt)} · {status.callsLeft} of {status.quota} API calls left today</>} />
      {status.banner && (
        <div role="status" className="card" style={{ padding: 12, marginBottom: 16, background: 'var(--yellow-fill)', color: 'var(--yellow)' }}>
          <strong>{status.banner.message}</strong> <span>Next sync is allowed after {new Date(status.banner.nextAllowedAt).toLocaleString()}. Everything below uses stored data.</span>
        </div>
      )}
      {status.lastError && <div role="alert" className="card" style={{ padding: 12, marginBottom: 16, color: 'var(--red)' }}>Last sync failed: {status.lastError}</div>}

      <section aria-label="Key numbers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Metric label="Opportunities found" value={found} sub="returned by SAM.gov, 30 days" />
        <Metric label="After filtering" value={afterFilter} sub="stored for your NAICS codes" href="/opportunities?tab=all" />
        <Metric label="Needs review" value={needsReview} href="/pipeline" />
        <Metric label="Being pursued" value={m.beingPursued} href="/pipeline" />
        <Metric label="Potential value" value={m.potentialValue} format="money" sub={m.unknownValueCount ? `+ ${m.unknownValueCount} unknown` : 'all values known'} />
        <Metric label="Deadlines in 7 days" value={m.deadlines7} href="/opportunities?saved=1" />
      </section>

      <section className="card" style={{ padding: 16, marginBottom: 24 }} aria-label="Deadlines, next 30 days">
        <h2 className="t-headline" style={{ margin: '0 0 12px' }}>Deadlines · next 30 days</h2>
        {dots.length === 0 ? <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: 0 }}>No deadlines in the next 30 days.</p> : <Timeline dots={dots} now={now} />}
      </section>

      <section aria-label="Panels" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, marginBottom: 24 }}>
        {PANELS.map((p) => {
          const list = p.key === 'new' ? (newOnes.data ?? []).map((o: any) => ({ oppId: o.id, title: o.title, department: o.department, deadline: o.response_deadline, color: o.color_label })) : panels[p.key].map((r) => ({ oppId: r.oppId, title: r.title, department: r.department, deadline: r.deadline, color: r.color }))
          return (
            <div key={p.key} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
                <h2 className="t-headline" style={{ margin: 0, flex: 1 }}>{p.title}{p.key !== 'new' && list.length > 0 && <span className="num" style={{ color: 'var(--label-secondary)', fontWeight: 400 }}> · {panels[p.key as PanelKey].length}</span>}</h2>
                <Link href={p.href} className="t-footnote">See all</Link>
              </div>
              {list.length === 0 ? <p className="t-callout" style={{ color: 'var(--label-secondary)', margin: '8px 0' }}>{p.empty}</p> : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {list.slice(0, 5).map((o) => (
                    <li key={o.oppId} className="hairline-b" style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
                      <ColorPill label={o.color} />
                      <Link href={`/opportunities/${o.oppId}`} className="t-callout" style={{ flex: 1, minWidth: 0, color: 'var(--label-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</Link>
                      <CountdownChip deadline={o.deadline} now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <section className="card" style={{ padding: 16 }} aria-label="Pipeline summary">
        <h2 className="t-headline" style={{ margin: '0 0 12px' }}>Pipeline</h2>
        {totalStage === 0 ? <Empty icon={CalendarClock} title="Your pipeline is empty" body="Add an opportunity to the pipeline from its card to track it through to a bid decision." action={<Link className="btn btn-primary" href="/opportunities?tab=bid_ready">Browse bid-ready</Link>} /> : (
          <>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }} role="img" aria-label={stages.filter((x) => x.count).map((x) => `${x.label} ${x.count}`).join(', ')}>
              {stages.filter((x) => x.count).map((x, i) => <div key={x.key} title={`${x.label}: ${x.count}`} style={{ flex: x.count, background: `color-mix(in srgb, var(--accent) ${25 + (i * 75) / 8}%, var(--bg-tertiary))` }} />)}
            </div>
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
              {stages.map((x) => <li key={x.key} className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{x.label} <span className="num" style={{ color: 'var(--label-primary)' }}>{x.count}</span></li>)}
            </ul>
          </>
        )}
      </section>
    </>
  )
}

function Timeline({ dots, now }: { dots: Array<{ id: string; title: string; deadline: string }>; now: Date }) {
  const W = 1000, H = 72, pad = 12
  const x = (d: string) => pad + ((new Date(d).getTime() - now.getTime()) / (30 * 864e5)) * (W - pad * 2)
  const buckets = new Map<number, number>()
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Deadline strip" style={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }}>
        <line x1={pad} x2={W - pad} y1={44} y2={44} stroke="var(--separator)" strokeWidth={1} />
        {[0, 7, 14, 21, 28].map((d) => <g key={d}><line x1={pad + (d / 30) * (W - pad * 2)} x2={pad + (d / 30) * (W - pad * 2)} y1={40} y2={48} stroke="var(--label-tertiary)" /><text x={pad + (d / 30) * (W - pad * 2)} y={66} fontSize={11} textAnchor="middle" fill="var(--label-secondary)">{d === 0 ? 'Today' : fmtDate(new Date(now.getTime() + d * 864e5).toISOString().slice(0, 10)).replace(/, \d{4}/, '')}</text></g>)}
        {dots.map((d) => {
          const days = daysLeft(d.deadline, now)!
          const key = Math.round(x(d.deadline) / 6)
          const stack = buckets.get(key) ?? 0
          buckets.set(key, stack + 1)
          const color = days <= 3 ? 'var(--red)' : days <= 14 ? 'var(--yellow)' : 'var(--accent)'
          const shape = days <= 3 ? <rect x={-5} y={-5} width={10} height={10} /> : days <= 14 ? <polygon points="0,-6 6,5 -6,5" /> : <circle r={5} />
          return (
            <a key={d.id} href={`/opportunities/${d.id}`}>
              <title>{`${d.title} — ${days} day${days === 1 ? '' : 's'}`}</title>
              <g transform={`translate(${x(d.deadline)}, ${34 - stack * 11})`} fill={color} tabIndex={0}>{shape}</g>
            </a>
          )
        })}
      </svg>
    </div>
  )
}

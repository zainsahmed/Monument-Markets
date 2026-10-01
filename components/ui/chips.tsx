import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { LABEL_TEXT } from '@/lib/classification'
import { countdownText, countdownTone, daysLeft, UNKNOWN } from '@/lib/format'
import type { ColorLabel, Level } from '@/lib/db-types'

export function Badge({ tone = 'gray', children, icon, title }: { tone?: 'green' | 'yellow' | 'red' | 'accent' | 'gray'; children: ReactNode; icon?: ReactNode; title?: string }) {
  return <span className={`badge tone-${tone}`} title={title}>{icon}{children}</span>
}

const PILL: Record<ColorLabel, { tone: 'green' | 'yellow' | 'red'; text: string; sr: string }> = {
  GREEN: { tone: 'green', text: 'Potential bid', sr: LABEL_TEXT.GREEN },
  YELLOW: { tone: 'yellow', text: 'Watch', sr: LABEL_TEXT.YELLOW },
  RED: { tone: 'red', text: 'Awarded', sr: LABEL_TEXT.RED },
}
/** POTENTIAL BID / WATCH / AWARDED — colour is always paired with text and a shape. */
export function ColorPill({ label }: { label: ColorLabel }) {
  const p = PILL[label]
  const dot = label === 'GREEN' ? '●' : label === 'YELLOW' ? '◐' : '■'
  return <Badge tone={p.tone} title={p.sr}><span aria-hidden>{dot}</span>{p.text}</Badge>
}

/** Neutral > 14 days, yellow 4–14, red ≤ 3, struck-through gray when past. */
export function CountdownChip({ deadline, now }: { deadline: string | null; now?: Date }) {
  const d = daysLeft(deadline, now)
  const tone = countdownTone(d)
  const style =
    tone === 'neutral' ? { background: 'var(--bg-tertiary)', color: 'var(--label-primary)' }
    : tone === 'yellow' ? { background: 'var(--yellow-fill)', color: 'var(--yellow)' }
    : tone === 'red' ? { background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--red)' }
    : { background: 'var(--bg-tertiary)', color: 'var(--gray)' }
  return (
    <span className="chip chip-countdown num" style={{ ...style, textDecoration: tone === 'past' ? 'line-through' : undefined }} title={deadline ? undefined : 'No response deadline listed'}>
      {tone === 'none' ? UNKNOWN : countdownText(d)}
    </span>
  )
}

export function LevelPill({ level }: { level: Level | null | undefined }) {
  const l = level ?? 'Unknown'
  const tone = l === 'High' ? 'accent' : l === 'Medium' ? 'gray' : l === 'Low' ? 'gray' : 'gray'
  return <Badge tone={tone}>{l}</Badge>
}

/** AI output labels — identical everywhere in the app. */
export function LabelChip({ label }: { label: 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION' }) {
  if (label === 'VERIFIED') return <Badge tone="green" icon={<CheckCircle2 size={11} strokeWidth={2} aria-hidden />}>Verified</Badge>
  if (label === 'ANALYSIS') return <Badge tone="accent" icon={<Sparkles size={11} strokeWidth={2} aria-hidden />}>AI analysis</Badge>
  return <Badge tone="yellow" icon={<AlertTriangle size={11} strokeWidth={2} aria-hidden />}>Needs verification</Badge>
}
export const LABEL_LONG = { VERIFIED: 'Verified from solicitation', ANALYSIS: 'AI analysis', NEEDS_VERIFICATION: 'Needs verification' } as const

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="t-footnote" style={{ color: 'var(--label-secondary)', display: 'flex', gap: 6, alignItems: 'flex-start' }}><Info size={14} strokeWidth={1.75} style={{ flex: 'none', marginTop: 1 }} aria-hidden />{children}</p>
}

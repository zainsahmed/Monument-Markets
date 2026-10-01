import type { LucideIcon } from 'lucide-react'
import { AlertCircle } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Button } from './Button'

/** Centered thin-stroke icon, one-line headline, one sentence, one primary action. Never a blank screen. */
export function Empty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '64px 24px', color: 'var(--label-secondary)' }}>
      <Icon size={40} strokeWidth={1.25} aria-hidden />
      <p className="t-headline" style={{ margin: 0, color: 'var(--label-primary)' }}>{title}</p>
      {body && <p className="t-callout" style={{ margin: 0, maxWidth: 420 }}>{body}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, retry }: { title?: string; body?: string; retry?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, padding: '48px 24px' }}>
      <AlertCircle size={36} strokeWidth={1.25} color="var(--red)" aria-hidden />
      <p className="t-headline" style={{ margin: 0 }}>{title}</p>
      {body && <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)', maxWidth: 420 }}>{body}</p>}
      {retry && <Button onClick={retry} style={{ marginTop: 12 }}>Try again</Button>}
    </div>
  )
}

export function Skeleton({ w = '100%', h = 16, style }: { w?: number | string; h?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} aria-hidden />
}
export function SkeletonRows({ n = 6, h = 36 }: { n?: number; h?: number }) {
  return <div aria-busy="true" aria-label="Loading" style={{ display: 'grid', gap: 1 }}>{Array.from({ length: n }, (_, i) => <Skeleton key={i} h={h} style={{ borderRadius: 0, opacity: 1 - i * 0.1 }} />)}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 className="t-largeTitle" style={{ margin: 0 }}>{title}</h1>
        {subtitle && <p className="t-footnote" style={{ margin: '4px 0 0', color: 'var(--label-secondary)' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </header>
  )
}

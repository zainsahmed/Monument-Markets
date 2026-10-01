'use client'
import { useEffect, useRef, useState } from 'react'

/** Dashboard number that ticks smoothly to its new value (instant under reduced motion). */
export function Metric({ label, value, format, sub, href, unknown }: { label: string; value: number; format?: 'number' | 'money'; sub?: string; href?: string; unknown?: boolean }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from.current === value) { setShown(value); from.current = value; return }
    const start = performance.now(), a = from.current, dur = 480
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(a + (value - a) * e))
      if (p < 1) raf = requestAnimationFrame(step); else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const text = unknown ? 'Unknown' : format === 'money' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: shown >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: shown >= 1_000_000 ? 1 : 0 }).format(shown) : shown.toLocaleString('en-US')
  const body = (
    <>
      <div className="t-subheadline" style={{ color: 'var(--label-secondary)' }}>{label}</div>
      <div className={unknown ? 't-title1' : 't-metric'} style={unknown ? { minHeight: 44, display: 'flex', alignItems: 'center', color: 'var(--label-secondary)' } : undefined} aria-label={`${label}: ${text}`}>{text}</div>
      <div className="t-footnote" style={{ color: 'var(--label-secondary)', minHeight: 16 }}>{sub ?? ''}</div>
    </>
  )
  const style = { display: 'block', padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--bg-primary)', color: 'inherit' } as const
  return href ? <a href={href} style={style}>{body}</a> : <div style={style}>{body}</div>
}

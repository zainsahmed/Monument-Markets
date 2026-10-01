'use client'
import { useLayoutEffect, useRef, useState } from 'react'

export interface SegOption<T extends string> { value: T; label: string; count?: number }
/** Apple-style segmented control with a sliding indicator. Radio-group semantics, arrow-key navigation. */
export function Seg<T extends string>({ value, onChange, options, label, className = '' }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value, options.length])
  const idx = options.findIndex((o) => o.value === value)
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={`seg ${className}`}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        e.preventDefault()
        const next = options[(idx + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length]
        onChange(next.value)
        requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
      }}>
      {thumb && <span className="seg-thumb" style={{ transform: `translateX(${thumb.x - 2}px)`, width: thumb.w }} aria-hidden />}
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined && <span className="num" style={{ marginLeft: 6, color: 'var(--label-secondary)', fontWeight: 400 }}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

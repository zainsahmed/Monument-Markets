'use client'
import * as P from '@radix-ui/react-popover'
import * as T from '@radix-ui/react-tooltip'
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

export function Popover({ trigger, children, width = 320, side = 'bottom', align = 'start' }: { trigger: ReactNode; children: ReactNode; width?: number; side?: 'top' | 'bottom' | 'left' | 'right'; align?: 'start' | 'center' | 'end' }) {
  return (
    <P.Root>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content side={side} align={align} sideOffset={6} collisionPadding={12} className="floating anim-pop" style={{ width: `min(${width}px, calc(100vw - 24px))`, padding: 16, zIndex: 60, transformOrigin: 'var(--radix-popover-content-transform-origin)' }}>
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

/** Small ⓘ button that opens an explanatory popover (AI Fit reasoning, formulas, classification rule…). */
export function InfoPopover({ label, children, width }: { label: string; children: ReactNode; width?: number }) {
  return (
    <Popover width={width} trigger={<button type="button" className="btn btn-icon btn-sm" style={{ width: 20, height: 20, padding: 0 }} aria-label={label}><Info size={14} strokeWidth={1.75} aria-hidden /></button>}>
      <div className="t-callout">{children}</div>
    </Popover>
  )
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <T.Provider delayDuration={400}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="floating anim-pop t-footnote" style={{ padding: '4px 8px', zIndex: 70, borderRadius: 'var(--radius-sm)' }}>{text}</T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}

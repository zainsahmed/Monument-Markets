'use client'
import * as D from '@radix-ui/react-dialog'
import * as A from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

/** Sheet: slides up, used sparingly (prefer inline editing and the inspector). */
export function Sheet({ open, onOpenChange, title, description, children, width = 520 }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; width?: number }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 80 }} />
        <D.Content className="floating anim-sheet" style={{ position: 'fixed', zIndex: 81, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `min(${width}px, calc(100vw - 24px))`, maxHeight: 'calc(100dvh - 48px)', overflow: 'auto', padding: 24, borderRadius: 'var(--radius-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <D.Title className="t-title2" style={{ margin: 0 }}>{title}</D.Title>
              {description ? <D.Description className="t-callout" style={{ margin: '4px 0 0', color: 'var(--label-secondary)' }}>{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close asChild><Button variant="icon" aria-label="Close"><X size={18} strokeWidth={1.75} /></Button></D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/** Confirmation for destructive actions that cannot offer Undo. */
export function Confirm({ trigger, title, body, confirmLabel = 'Delete', onConfirm }: { trigger: ReactNode; title: string; body: string; confirmLabel?: string; onConfirm: () => void }) {
  return (
    <A.Root>
      <A.Trigger asChild>{trigger}</A.Trigger>
      <A.Portal>
        <A.Overlay className="anim-fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 80 }} />
        <A.Content className="floating anim-pop" style={{ position: 'fixed', zIndex: 81, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(400px, calc(100vw - 24px))', padding: 24, borderRadius: 'var(--radius-xl)' }}>
          <A.Title className="t-headline" style={{ margin: 0 }}>{title}</A.Title>
          <A.Description className="t-callout" style={{ color: 'var(--label-secondary)', margin: '8px 0 20px' }}>{body}</A.Description>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <A.Cancel asChild><Button>Cancel</Button></A.Cancel>
            <A.Action asChild><Button variant="destructive" onClick={onConfirm}>{confirmLabel}</Button></A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}

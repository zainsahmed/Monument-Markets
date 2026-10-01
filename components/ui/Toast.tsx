'use client'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

interface ToastItem { id: number; message: string; undo?: () => void; tone?: 'error' }
interface Api { toast: (message: string, opts?: { undo?: () => void; error?: boolean }) => void }
const Ctx = createContext<Api>({ toast: () => undefined })
export const useToast = () => useContext(Ctx)

/** Bottom-center, translucent, auto-dismiss in 4 s; carries Undo for destructive actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const n = useRef(0)
  const toast = useCallback<Api['toast']>((message, opts) => {
    const id = ++n.current
    setItems((x) => [...x.slice(-2), { id, message, undo: opts?.undo, tone: opts?.error ? 'error' : undefined }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000)
  }, [])
  const api = useMemo(() => ({ toast }), [toast])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 100, pointerEvents: 'none' }}>
        {items.map((t) => (
          <div key={t.id} className="floating material-toolbar anim-pop" style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 16px', borderRadius: 'var(--radius-lg)', maxWidth: 'min(520px, calc(100vw - 32px))', color: t.tone === 'error' ? 'var(--red)' : undefined }}>
            <span className="t-callout">{t.message}</span>
            {t.undo && <Button variant="plain" small onClick={() => { t.undo?.(); setItems((x) => x.filter((i) => i.id !== t.id)) }}>Undo</Button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

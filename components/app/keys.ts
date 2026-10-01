'use client'
import { useEffect, useRef } from 'react'

/** Tiny event bus: the shell turns key presses into 'fp:key' events; pages subscribe with useKeyAction. */
export function useKeyAction(handler: (key: string, e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => {
    if (!enabled) return
    const fn = (e: Event) => ref.current((e as CustomEvent<{ key: string; event: KeyboardEvent }>).detail.key, (e as CustomEvent<{ key: string; event: KeyboardEvent }>).detail.event)
    window.addEventListener('fp:key', fn)
    return () => window.removeEventListener('fp:key', fn)
  }, [enabled])
}
export const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }))

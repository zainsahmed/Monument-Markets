'use client'
import { useEffect, useState } from 'react'

export function useMedia(query: string, initial = false) {
  const [m, setM] = useState(initial)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setM(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return m
}

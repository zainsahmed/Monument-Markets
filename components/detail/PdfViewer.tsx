'use client'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { normaliseText } from '@/lib/ai/citations'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Pdfjs = typeof import('pdfjs-dist')
let pdfjsPromise: Promise<Pdfjs> | null = null
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then((m) => { m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString(); return m })
  return pdfjsPromise
}

/** Find the text items covering `needle` (normalised) on a page, for highlighting. */
function matchItems(items: any[], needle: string): any[] {
  const n = normaliseText(needle)
  if (n.length < 3) return []
  let acc = ''
  const ranges: Array<{ s: number; e: number; it: any }> = []
  for (const it of items) {
    const t = normaliseText(it.str ?? '')
    if (!t) continue
    if (acc) acc += ' '
    const s = acc.length
    acc += t
    ranges.push({ s, e: acc.length, it })
  }
  const at = acc.indexOf(n)
  if (at < 0) return []
  return ranges.filter((r) => r.e > at && r.s < at + n.length).map((r) => r.it)
}

export function PdfViewer({ url, page, highlight, onPage }: { url: string; page: number; highlight: string; onPage: (p: number) => void }) {
  const [doc, setDoc] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [num, setNum] = useState(0)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<number[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<boolean | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const textCache = useRef(new Map<number, any[]>())

  useEffect(() => {
    let cancelled = false
    let task: any
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        task = pdfjs.getDocument({ url, withCredentials: false })
        const d = await task.promise
        if (cancelled) return
        setDoc(d); setNum(d.numPages)
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this PDF') }
    })()
    return () => { cancelled = true; void task?.destroy?.() }
  }, [url])

  const items = useCallback(async (p: number) => {
    if (textCache.current.has(p)) return textCache.current.get(p)!
    const pg = await doc.getPage(p)
    const c = await pg.getTextContent()
    textCache.current.set(p, c.items as any[])
    return c.items as any[]
  }, [doc])

  // render current page + highlight
  useEffect(() => {
    if (!doc || page < 1 || page > num) return
    let cancelled = false
    ;(async () => {
      const pg = await doc.getPage(page)
      const w = wrap.current?.clientWidth ?? 800
      const base = pg.getViewport({ scale: 1 })
      const viewport = pg.getViewport({ scale: Math.min(2, (w - 16) / base.width) })
      const cv = canvas.current!
      const ratio = window.devicePixelRatio || 1
      cv.width = Math.floor(viewport.width * ratio); cv.height = Math.floor(viewport.height * ratio)
      cv.style.width = `${viewport.width}px`; cv.style.height = `${viewport.height}px`
      const ctx = cv.getContext('2d')!
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      await pg.render({ canvasContext: ctx, viewport, canvas: cv } as any).promise
      if (cancelled) return
      const needle = query.trim().length >= 3 && hits?.includes(page) ? query : highlight
      if (!needle) { setFound(null); return }
      const matched = matchItems(await items(page), needle)
      setFound(matched.length > 0)
      const pdfjs = await loadPdfjs()
      ctx.save(); ctx.fillStyle = 'rgba(255, 214, 0, 0.38)'
      for (const it of matched) {
        const tx = (pdfjs.Util as any).transform(viewport.transform, it.transform)
        const h = Math.hypot(tx[2], tx[3])
        ctx.fillRect(tx[4], tx[5] - h, it.width * viewport.scale, h * 1.15)
      }
      ctx.restore()
    })().catch(() => undefined)
    return () => { cancelled = true }
  }, [doc, page, num, highlight, query, hits, items])

  async function search() {
    const q = query.trim()
    if (q.length < 2 || !doc) return
    setSearching(true)
    const out: number[] = []
    for (let p = 1; p <= num; p++) { const t = normaliseText((await items(p)).map((i: any) => i.str).join(' ')); if (t.includes(normaliseText(q))) out.push(p) }
    setHits(out); setSearching(false)
    if (out.length) onPage(out[0])
  }

  if (error) return <p role="alert" className="t-callout" style={{ color: 'var(--red)', padding: 16 }}>{error} You can still download the file or read the extracted text.</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0, height: 'min(78dvh, 900px)' }}>
      <Thumbs doc={doc} num={num} page={page} onPage={onPage} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="hairline-b" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8, flexWrap: 'wrap' }}>
          <Button variant="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></Button>
          <label className="t-callout num" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="sr-only">Page</span><input className="input num" style={{ width: 56, textAlign: 'center' }} inputMode="numeric" value={page} onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')); if (v >= 1 && v <= num) onPage(v) }} /> / {num || '…'}</label>
          <Button variant="icon" aria-label="Next page" disabled={page >= num} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></Button>
          <form onSubmit={(e) => { e.preventDefault(); void search() }} style={{ display: 'flex', gap: 4, marginLeft: 'auto' }} role="search">
            <input className="input" style={{ width: 200 }} aria-label="Search in document" placeholder="Search document…" value={query} onChange={(e) => { setQuery(e.target.value); setHits(null) }} />
            <Button variant="icon" type="submit" aria-label="Search" disabled={searching}><Search size={16} /></Button>
            {hits && <Button variant="icon" aria-label="Clear search" onClick={() => { setHits(null); setQuery('') }}><X size={16} /></Button>}
          </form>
        </div>
        {hits && <p className="t-footnote" role="status" style={{ margin: 0, padding: '4px 12px', color: 'var(--label-secondary)' }}>{hits.length ? <>Found on page{hits.length > 1 ? 's' : ''} {hits.map((h) => <button key={h} type="button" className="btn btn-plain btn-sm" style={{ height: 20, padding: '0 4px' }} onClick={() => onPage(h)}>{h}</button>)}</> : 'No matches.'}</p>}
        {highlight && found === false && <p className="t-footnote" role="status" style={{ margin: 0, padding: '4px 12px', color: 'var(--yellow)' }}>The cited text couldn’t be located visually on this page (text layout differs). Check the Text view.</p>}
        <div ref={wrap} style={{ flex: 1, overflow: 'auto', background: 'var(--bg-tertiary)', padding: 8 }}><canvas ref={canvas} aria-label={`Page ${page}`} style={{ display: 'block', margin: '0 auto', background: '#fff', boxShadow: '0 1px 4px var(--shadow-soft)' }} /></div>
      </div>
    </div>
  )
}

function Thumbs({ doc, num, page, onPage }: { doc: any; num: number; page: number; onPage: (p: number) => void }) {
  return (
    <div className="hairline-r" style={{ width: 96, overflow: 'auto', padding: 8, display: 'grid', gap: 8, alignContent: 'start' }} role="navigation" aria-label="Page thumbnails">
      {Array.from({ length: num }, (_, i) => <Thumb key={i} doc={doc} p={i + 1} active={page === i + 1} onPage={onPage} />)}
    </div>
  )
}
function Thumb({ doc, p, active, onPage }: { doc: any; p: number; active: boolean; onPage: (p: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(([e]) => e.isIntersecting && setVis(true), { rootMargin: '200px' }); io.observe(el); return () => io.disconnect() }, [])
  useEffect(() => {
    if (!vis || !doc) return
    let cancelled = false
    ;(async () => {
      const pg = await doc.getPage(p); const vp = pg.getViewport({ scale: 0.18 }); const cv = ref.current!
      cv.width = vp.width; cv.height = vp.height
      if (!cancelled) await pg.render({ canvasContext: cv.getContext('2d')!, viewport: vp, canvas: cv } as any).promise
    })().catch(() => undefined)
    return () => { cancelled = true }
  }, [vis, doc, p])
  return <button type="button" onClick={() => onPage(p)} aria-label={`Go to page ${p}`} aria-current={active ? 'page' : undefined} style={{ background: 'none', border: 0, padding: 2, borderRadius: 6, outline: active ? '2px solid var(--accent)' : undefined }}><canvas ref={ref} style={{ width: '100%', display: 'block', background: '#fff' }} /><span className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{p}</span></button>
}

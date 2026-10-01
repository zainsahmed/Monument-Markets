'use client'
import { Download, Eye, FileSpreadsheet, FileText, FileType2, Upload, CloudDownload, X } from 'lucide-react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge, InfoNote } from '@/components/ui/chips'
import { Empty } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { normaliseText } from '@/lib/ai/citations'
import type { DetailData } from '@/lib/data/detail'
import { fmtBytes, orUnknown } from '@/lib/format'
import { PdfViewer } from './PdfViewer'

const ICON = (m: string | null, n: string) => (/sheet|xlsx/.test(m ?? n) ? FileSpreadsheet : /word|docx/.test(m ?? n) ? FileType2 : FileText)
const STATUS = { parsed: ['green', 'Parsed'], ocr_needed: ['yellow', 'OCR needed'], failed: ['red', 'Failed'], pending: ['gray', 'Pending'] } as const

interface PageRow { page_number: number; section_heading: string | null; locator: string | null; text: string; page_reliable: boolean }

export function DocumentsTab({ d, canWrite }: { d: DetailData; canWrite: boolean }) {
  const sp = useSearchParams()
  const router = useRouter()
  const path = usePathname()
  const { toast } = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'fetch' | 'upload' | null>(null)
  const docId = sp.get('doc')
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  const hl = sp.get('hl') ?? ''
  const cur = d.docs.find((x) => x.id === docId)
  const [url, setUrl] = useState<string | null>(null)
  const [mode, setMode] = useState<'page' | 'text'>('page')
  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const nav = (patch: Record<string, string | null>) => { const q = new URLSearchParams(sp.toString()); for (const [k, v] of Object.entries(patch)) v === null ? q.delete(k) : q.set(k, v); router.replace(`${path}?${q}`, { scroll: false }) }

  useEffect(() => {
    setUrl(null); setPages(null); setErr(null)
    if (!cur) return
    let dead = false
    const isPdf = /pdf/.test(cur.mime_type ?? cur.file_name)
    setMode(isPdf ? 'page' : 'text')
    if (isPdf) fetch(`/api/documents/${cur.id}/url`).then((r) => r.json()).then((j) => { if (!dead) j.url ? setUrl(j.url) : setErr(j.error ?? 'Could not open the file') }).catch(() => !dead && setErr('Could not open the file'))
    fetch(`/api/documents/${cur.id}/pages`).then((r) => r.json()).then((j) => !dead && setPages(j.pages ?? [])).catch(() => undefined)
    return () => { dead = true }
  }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchFromSam() {
    setBusy('fetch')
    const r = await fetch(`/api/opportunities/${d.opp.id}/documents/fetch`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) return toast(j.error ?? 'Fetch failed', { error: true })
    const parts = [j.descriptionFetched && 'description', j.fetched?.length && `${j.fetched.length} file${j.fetched.length > 1 ? 's' : ''}`].filter(Boolean)
    toast(parts.length ? `Fetched ${parts.join(' and ')}. ${j.remainingCalls} SAM call${j.remainingCalls === 1 ? '' : 's'} left today.` : j.errors?.length ? j.errors[0] : 'Nothing new to fetch.', { error: !parts.length && !!j.errors?.length })
    router.refresh()
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy('upload')
    const fd = new FormData(); [...files].forEach((f) => fd.append('file', f))
    const r = await fetch(`/api/opportunities/${d.opp.id}/documents/upload`, { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) return toast(j.error ?? 'Upload failed', { error: true })
    const bad = (j.documents as Array<{ parseStatus: string; name: string; note: string | null }>).filter((x) => x.parseStatus !== 'parsed')
    toast(bad.length ? `${bad[0].name}: ${bad[0].note ?? bad[0].parseStatus}` : 'Uploaded and parsed', { error: bad.some((b) => b.parseStatus === 'failed') })
    router.refresh()
  }
  async function download(id: string) {
    const r = await fetch(`/api/documents/${id}/url?download=1`); const j = await r.json()
    if (j.url) window.open(j.url, '_blank', 'noopener'); else toast(j.error ?? 'Could not create a download link', { error: true })
  }
  const canFetch = d.opp.source === 'SAM' && canWrite && (d.opp.resource_links?.length > 0 || !d.opp.description_fetched_at)
  const textPages = useMemo(() => pages ?? [], [pages])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canFetch && <Button variant="primary" disabled={busy !== null} onClick={fetchFromSam}><CloudDownload size={14} aria-hidden />{busy === 'fetch' ? 'Fetching…' : 'Fetch from SAM.gov'}</Button>}
        {canWrite && <><input ref={fileInput} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.txt" onChange={(e) => { void upload(e.target.files); e.target.value = '' }} /><Button disabled={busy !== null} onClick={() => fileInput.current?.click()}><Upload size={14} aria-hidden />{busy === 'upload' ? 'Uploading…' : 'Upload file'}</Button></>}
        <span className="t-footnote" style={{ color: 'var(--label-secondary)' }}>{d.opp.source === 'SAM' ? `${d.opp.resource_links?.length ?? 0} attachment link${(d.opp.resource_links?.length ?? 0) === 1 ? '' : 's'} on the notice. Downloads use your daily SAM.gov call budget, so they happen only when you ask.` : 'PDF, DOCX, XLSX or TXT, up to your upload limit.'}</span>
      </div>
      {d.docs.length === 0 ? <Empty icon={FileText} title="No documents yet" body={d.opp.source === 'SAM' ? 'Fetch the attachments from SAM.gov, or upload a file you already have.' : 'Upload the RFQ PDF or other files for this opportunity.'} /> : (
        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: '0 16px' }} aria-label="Documents">
          {d.docs.map((x) => { const Icon = ICON(x.mime_type, x.file_name); const [tone, label] = STATUS[x.parse_status]; return (
            <li key={x.id} className="hairline-b" style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 56, flexWrap: 'wrap', padding: '8px 0' }}>
              <Icon size={20} strokeWidth={1.5} aria-hidden style={{ color: 'var(--label-secondary)' }} />
              <div style={{ flex: 1, minWidth: 180 }}><div className="t-callout" style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{x.file_name}</div><div className="t-footnote num" style={{ color: 'var(--label-secondary)' }}>{fmtBytes(x.size_bytes)} · {x.page_count ?? 'Unknown'} {x.mime_type?.includes('pdf') ? 'pages' : 'sections'}{x.company_id ? ' · your upload' : ' · from SAM.gov'}</div>{x.parse_error && <div className="t-footnote" style={{ color: x.parse_status === 'parsed' ? 'var(--label-secondary)' : 'var(--yellow)' }}>{x.parse_error}</div>}</div>
              <Badge tone={tone}>{label}</Badge>
              <Button small onClick={() => nav({ doc: x.id, page: '1', hl: null })}><Eye size={14} aria-hidden />View</Button>
              <Button small variant="plain" onClick={() => download(x.id)}><Download size={14} aria-hidden />Download</Button>
            </li>) })}
        </ul>
      )}
      {cur && (
        <section className="card" style={{ overflow: 'hidden' }} aria-label={`Viewer: ${cur.file_name}`}>
          <header className="hairline-b" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px' }}>
            <strong className="t-callout" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.file_name}</strong>
            {/pdf/.test(cur.mime_type ?? cur.file_name) && <div className="seg" role="group" aria-label="View mode">{(['page', 'text'] as const).map((m) => <button key={m} type="button" aria-selected={mode === m} onClick={() => setMode(m)}>{m === 'page' ? 'Page view' : 'Text view'}</button>)}</div>}
            <Button variant="icon" aria-label="Close viewer" onClick={() => nav({ doc: null, page: null, hl: null })}><X size={18} /></Button>
          </header>
          {err && <p role="alert" className="t-callout" style={{ color: 'var(--red)', padding: 16 }}>{err}</p>}
          {mode === 'page' && url && <PdfViewer url={url} page={page} highlight={hl} onPage={(p) => nav({ page: String(p) })} />}
          {mode === 'page' && !url && !err && <div className="skeleton" style={{ height: 400, borderRadius: 0 }} aria-busy="true" />}
          {mode === 'text' && <TextView pages={textPages} loading={pages === null} page={page} highlight={hl} />}
        </section>
      )}
      <InfoNote>Documents are stored privately and opened through short-lived signed links. Scanned pages need OCR; Fieldpoint never guesses at text it can’t read.</InfoNote>
    </div>
  )
}

function TextView({ pages, loading, page, highlight }: { pages: PageRow[]; loading: boolean; page: number; highlight: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'center' }) }, [page, highlight, pages.length])
  if (loading) return <div className="skeleton" style={{ height: 300, borderRadius: 0 }} aria-busy="true" />
  if (!pages.length) return <p className="t-callout" style={{ padding: 16, color: 'var(--label-secondary)' }}>No extracted text for this document (it may need OCR).</p>
  const n = normaliseText(highlight)
  return (
    <div style={{ maxHeight: '70dvh', overflow: 'auto', padding: 16, display: 'grid', gap: 16 }}>
      {pages.map((p) => {
        const isCur = p.page_number === page
        const norm = normaliseText(p.text)
        const idx = n && isCur ? norm.indexOf(n) : -1
        return (
          <article key={p.page_number} ref={isCur ? (ref as React.RefObject<HTMLElement>) : undefined} aria-label={p.page_reliable ? `Page ${p.page_number}` : orUnknown(p.section_heading)} style={{ outline: isCur ? '2px solid var(--accent)' : undefined, borderRadius: 'var(--radius-md)', padding: 12, background: isCur ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}>
            <h3 className="t-footnote" style={{ margin: '0 0 8px', color: 'var(--label-secondary)' }}>{p.page_reliable ? `Page ${p.page_number}` : 'Page unavailable'}{p.section_heading ? ` · ${p.section_heading}` : ''}{p.locator ? ` · ${p.locator}` : ''}</h3>
            {idx >= 0 ? <HighlightedText text={p.text} needle={highlight} /> : <pre className="t-callout" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{p.text}</pre>}
          </article>
        )
      })}
    </div>
  )
}

/** Highlights the snippet in raw text by matching whitespace-insensitively. */
function HighlightedText({ text, needle }: { text: string; needle: string }) {
  const words = needle.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(words.join('\\s+'), 'i')
  const m = text.match(re)
  if (!m || m.index === undefined) return <pre className="t-callout" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{text}</pre>
  return <pre className="t-callout" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{text.slice(0, m.index)}<mark style={{ background: 'rgba(255, 214, 0, 0.45)', color: 'inherit' }}>{m[0]}</mark>{text.slice(m.index + m[0].length)}</pre>
}

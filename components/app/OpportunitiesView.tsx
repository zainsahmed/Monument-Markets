'use client'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Bookmark, ChevronDown, ChevronUp, Columns3, Inbox, LayoutGrid, Rows3, Sparkles, SlidersHorizontal, X, FileText } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ColorPill, CountdownChip, LevelPill } from '@/components/ui/chips'
import { Popover } from '@/components/ui/Popover'
import { Seg } from '@/components/ui/Seg'
import { Sheet } from '@/components/ui/Dialog'
import { Empty, ErrorState, SkeletonRows } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toast'
import { addToPipeline, bulkAction, setWorkflowStatus, toggleSaved } from '@/lib/actions/opportunities'
import { saveSearch } from '@/lib/actions/alerts'
import { savePreferences } from '@/lib/actions/company'
import type { OppRow, SortKey } from '@/lib/data/opportunities'
import { PIPELINE_STAGES } from '@/lib/db-types'
import { orUnknown, fmtDate } from '@/lib/format'
import { NOTICE_LABELS } from '@/lib/sam/notice-types'
import { emptyFilters, FiltersSchema, type Filters } from '@/lib/search'
import { AiSearchSheet } from './AiSearch'
import { FilterBar } from './FilterBar'
import { OpportunityCard, placeOf } from './OpportunityCard'
import { useKeyAction } from './keys'
import { useMedia } from './useMedia'

type ColId = 'label' | 'title' | 'agency' | 'type' | 'naics' | 'psc' | 'setaside' | 'place' | 'posted' | 'deadline' | 'docs' | 'fit' | 'stage'
const DEFAULT_COLS: Record<ColId, boolean> = { label: true, title: true, agency: true, type: true, naics: true, psc: true, setaside: true, place: true, posted: true, deadline: true, docs: true, fit: true, stage: true }
const COL_LABEL: Record<ColId, string> = { label: 'Label', title: 'Title', agency: 'Agency', type: 'Notice type', naics: 'NAICS', psc: 'PSC', setaside: 'Set-aside', place: 'Place of performance', posted: 'Posted', deadline: 'Deadline', docs: 'Docs', fit: 'AI fit', stage: 'Stage' }
const SORTABLE: Partial<Record<ColId, SortKey>> = { title: 'title', agency: 'agency', naics: 'naics', posted: 'posted', deadline: 'deadline' }
const stageLabel = (k: string | null) => PIPELINE_STAGES.find((s) => s.key === k)?.label ?? '—'

export interface ViewProps { initial: { rows: OppRow[]; total: number | null }; filters: Filters; savedOnly: boolean; role: string; prefs: { columns?: Record<string, boolean>; density?: 'compact' | 'comfortable' }; counts: { bidReady: number; watch: number; awarded: number } }

export function OpportunitiesView({ initial, filters: initialFilters, savedOnly, role, prefs, counts }: ViewProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'deadline', dir: 'asc' })
  const [view, setView] = useState<'table' | 'card'>('table')
  const [density, setDensity] = useState<'compact' | 'comfortable'>(prefs.density ?? 'compact')
  const [cols, setCols] = useState<Record<ColId, boolean>>({ ...DEFAULT_COLS, ...(prefs.columns as Record<ColId, boolean> | undefined) })
  const [sel, setSel] = useState(0)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [inspect, setInspect] = useState(true)
  const [aiOpen, setAiOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, Partial<NonNullable<OppRow['co']>>>>({})
  const { toast } = useToast()
  const router = useRouter()
  const qc = useQueryClient()
  const mobile = useMedia('(max-width: 767px)')
  const tablet = useMedia('(max-width: 1023px)')
  const canWrite = role !== 'viewer'
  const scroller = useRef<HTMLDivElement>(null)
  const firstKey = useRef(JSON.stringify([initialFilters, 'deadline', 'asc']))

  useEffect(() => { try { const d = localStorage.getItem('fp-density'); if (d === 'compact' || d === 'comfortable') setDensity(d); const c = localStorage.getItem('fp-cols'); if (c) setCols((x) => ({ ...x, ...JSON.parse(c) })); const v = localStorage.getItem('fp-oppview'); if (v === 'card') setView('card') } catch { /* ignore */ } }, [])

  const key = useMemo(() => JSON.stringify([filters, sort.key, sort.dir]), [filters, sort])
  const q = useInfiniteQuery({
    queryKey: ['opps', key, savedOnly],
    initialPageParam: 0,
    initialData: key === firstKey.current && !savedOnly === !savedOnly ? { pages: [{ rows: initial.rows, total: initial.total, nextOffset: initial.rows.length >= 100 ? 100 : null }], pageParams: [0] } : undefined,
    queryFn: async ({ pageParam }) => {
      const sp = new URLSearchParams({ filters: JSON.stringify(filters), offset: String(pageParam), limit: '100', sort: sort.key, dir: sort.dir })
      if (savedOnly) sp.set('saved', '1')
      const r = await fetch(`/api/opportunities?${sp}`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not load opportunities')
      return (await r.json()) as { rows: OppRow[]; total: number | null; nextOffset: number | null }
    },
    getNextPageParam: (last) => last.nextOffset,
  })
  const rows = useMemo(() => (q.data?.pages.flatMap((p) => p.rows) ?? []).map((r) => (overrides[r.id] ? { ...r, co: { ...(r.co ?? { id: '', workflow_status: 'none', pipeline_stage: null, saved: false, ai_fit: null, complexity: null }), ...overrides[r.id] } as OppRow['co'] } : r)), [q.data, overrides])

  const apply = useCallback((f: Filters) => {
    setFilters(f); setSel(0); setChecked(new Set())
    const sp = new URLSearchParams(location.search)
    sp.set('tab', f.tab)
    const { tab: _t, ...rest } = f
    const nonEmpty = JSON.stringify(rest) !== JSON.stringify(emptyFilters() && (({ tab: _x, ...r }) => r)(emptyFilters()))
    if (nonEmpty) sp.set('f', JSON.stringify(rest)); else sp.delete('f')
    history.replaceState(null, '', `${location.pathname}?${sp}`)
  }, [])

  // ---- optimistic row actions ----
  const patch = (id: string, p: Partial<NonNullable<OppRow['co']>> | null) => setOverrides((o) => { const n = { ...o }; if (p) n[id] = { ...n[id], ...p }; else delete n[id]; return n })
  const onSave = async (o: OppRow) => {
    const next = !o.co?.saved
    patch(o.id, { saved: next })
    const r = await toggleSaved({ opportunityId: o.id, saved: next })
    if (!r.ok) { patch(o.id, { saved: !next }); toast(r.error, { error: true }) } else toast(next ? 'Saved' : 'Removed from saved', { undo: () => { patch(o.id, { saved: !next }); void toggleSaved({ opportunityId: o.id, saved: !next }) } })
  }
  const onPass = async (o: OppRow) => {
    const was = o.co?.workflow_status ?? 'none'
    const next = was === 'pass' ? 'none' : 'pass'
    patch(o.id, { workflow_status: next })
    const r = await setWorkflowStatus({ opportunityId: o.id, status: next })
    if (!r.ok) { patch(o.id, { workflow_status: was }); toast(r.error, { error: true }) } else toast(next === 'pass' ? 'Passed' : 'Pass removed', { undo: () => { patch(o.id, { workflow_status: was }); void setWorkflowStatus({ opportunityId: o.id, status: was }) } })
  }
  const onPipeline = async (o: OppRow) => {
    patch(o.id, { pipeline_stage: 'new', saved: true })
    const r = await addToPipeline({ opportunityIds: [o.id] })
    if (!r.ok) { patch(o.id, { pipeline_stage: null }); toast(r.error, { error: true }) } else toast('Added to pipeline')
  }
  const bulk = async (action: 'save' | 'pass' | 'pipeline') => {
    const ids = [...checked]
    ids.forEach((id) => patch(id, action === 'save' ? { saved: true } : action === 'pass' ? { workflow_status: 'pass' } : { pipeline_stage: 'new', saved: true }))
    const r = await bulkAction({ opportunityIds: ids, action })
    if (!r.ok) { ids.forEach((id) => patch(id, null)); toast(r.error, { error: true }) } else { toast(`${ids.length} updated`); setChecked(new Set()); void qc.invalidateQueries({ queryKey: ['opps'] }) }
  }
  const actions = { onSave, onPass, onPipeline, canWrite }

  // ---- keyboard: J/K move, Enter open, S save, P pass, A analyze ----
  const cur = rows[Math.min(sel, rows.length - 1)]
  useKeyAction((k, e) => {
    if (!rows.length) return
    if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setSel((i) => Math.min(rows.length - 1, i + 1)) }
    else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
    else if (k === 'enter' && cur) router.push(`/opportunities/${cur.id}`)
    else if (k === 's' && cur && canWrite) void onSave(cur)
    else if (k === 'p' && cur && canWrite) void onPass(cur)
    else if (k === 'a' && cur) router.push(`/opportunities/${cur.id}?tab=ai&analyze=1`)
  })
  useEffect(() => { const el = scroller.current?.querySelector(`[data-idx="${sel}"]`); el?.scrollIntoView({ block: 'nearest' }) }, [sel])
  useEffect(() => { const h = () => setAiOpen(true); window.addEventListener('fp:ai-search', h); return () => window.removeEventListener('fp:ai-search', h) }, [])

  // ---- table ----
  const columns = useMemo<ColumnDef<OppRow>[]>(() => (Object.keys(COL_LABEL) as ColId[]).filter((c) => cols[c]).map((c) => ({ id: c, header: COL_LABEL[c] })), [cols])
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel(), manualSorting: true })
  const rowH = density === 'compact' ? 36 : 44
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => rowH, overscan: 14 })
  const items = virt.getVirtualItems()
  useEffect(() => { const last = items[items.length - 1]; if (last && last.index >= rows.length - 20 && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage() }, [items, rows.length, q])

  const toggleSort = (c: ColId) => { const k = SORTABLE[c]; if (!k) return; setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'posted' ? 'desc' : 'asc' })) }
  const persistCols = (n: Record<ColId, boolean>) => { setCols(n); try { localStorage.setItem('fp-cols', JSON.stringify(n)) } catch { /* ignore */ } void savePreferences({ columns: n }) }
  const setDens = (d: 'compact' | 'comfortable') => { setDensity(d); try { localStorage.setItem('fp-density', d) } catch { /* ignore */ } document.documentElement.dataset.density = d; void savePreferences({ density: d }) }
  const setV = (v: 'table' | 'card') => { setView(v); try { localStorage.setItem('fp-oppview', v) } catch { /* ignore */ } }

  const cell = (o: OppRow, c: ColId) => {
    switch (c) {
      case 'label': return <ColorPill label={o.color_label} />
      case 'title': return <Link href={`/opportunities/${o.id}`} tabIndex={-1} style={{ color: 'var(--label-primary)', fontWeight: 500 }}>{o.co?.saved && <Bookmark size={12} fill="currentColor" style={{ color: 'var(--accent)', marginRight: 6 }} aria-label="Saved" />}{o.title}</Link>
      case 'agency': return orUnknown(o.sub_tier ?? o.department)
      case 'type': return orUnknown(o.notice_type ?? NOTICE_LABELS[o.notice_type_code ?? ''])
      case 'naics': return <span className="num">{orUnknown(o.naics)}</span>
      case 'psc': return <span className="num">{orUnknown(o.psc)}</span>
      case 'setaside': return orUnknown(o.set_aside_code ?? o.set_aside)
      case 'place': return placeOf(o)
      case 'posted': return <span className="num">{fmtDate(o.posted_date)}</span>
      case 'deadline': return <CountdownChip deadline={o.response_deadline} />
      case 'docs': return <span className="num">{o.docs}</span>
      case 'fit': return <LevelPill level={o.co?.ai_fit} />
      case 'stage': return stageLabel(o.co?.pipeline_stage ?? null)
    }
  }
  const widths: Record<ColId, number> = { label: 130, title: 360, agency: 200, type: 190, naics: 90, psc: 70, setaside: 90, place: 150, posted: 110, deadline: 110, docs: 60, fit: 90, stage: 110 }
  const visibleCols = (Object.keys(COL_LABEL) as ColId[]).filter((c) => cols[c])
  const total = q.data?.pages[0]?.total
  const showInspector = inspect && !tablet && view === 'table' && !!cur
  const tabs = [{ value: 'bid_ready' as const, label: 'Bid-ready', count: counts.bidReady }, { value: 'watch' as const, label: 'Watch', count: counts.watch }, { value: 'awarded' as const, label: 'Awarded', count: counts.awarded }, { value: 'all' as const, label: 'All' }]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Seg label="Opportunity set" value={filters.tab} onChange={(t) => apply({ ...filters, tab: t })} options={tabs} />
        <Seg label="Source" value={filters.source ?? 'ALL'} onChange={(s) => apply({ ...filters, source: s === 'ALL' ? undefined : (s as 'SAM' | 'DIBBS') })} options={[{ value: 'ALL', label: 'All sources' }, { value: 'SAM', label: 'SAM' }, { value: 'DIBBS', label: 'DIBBS' }]} />
        <div style={{ flex: 1 }} />
        <input className="input" style={{ width: 240 }} type="search" placeholder="Keywords…" aria-label="Keyword search" defaultValue={filters.q ?? ''} onKeyDown={(e) => { if (e.key === 'Enter') apply({ ...filters, q: (e.target as HTMLInputElement).value.trim() || undefined }) }} />
        <Button onClick={() => setAiOpen(true)}><Sparkles size={14} aria-hidden />AI search</Button>
        <Button onClick={() => setSaveOpen(true)}><Bookmark size={14} aria-hidden />Save search</Button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}><FilterBar filters={filters} onChange={apply} /></div>
        <span className="t-footnote num" style={{ color: 'var(--label-secondary)' }} aria-live="polite">{q.isLoading ? 'Loading…' : `${rows.length.toLocaleString()}${total && total > rows.length ? ` of ${total.toLocaleString()}` : ''} opportunities`}</span>
        {!mobile && <Seg label="View" value={view} onChange={setV} options={[{ value: 'table', label: 'Table' }, { value: 'card', label: 'Cards' }]} />}
        {!mobile && view === 'table' && <>
          <Popover align="end" width={240} trigger={<Button variant="icon" aria-label="Columns and density"><Columns3 size={18} strokeWidth={1.75} /></Button>}>
            <strong className="t-subheadline">Columns</strong>
            <div style={{ display: 'grid', gap: 2, margin: '8px 0 12px' }}>{(Object.keys(COL_LABEL) as ColId[]).map((c) => <label key={c} className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 28 }}><input type="checkbox" checked={cols[c]} disabled={c === 'title'} onChange={(e) => persistCols({ ...cols, [c]: e.target.checked })} />{COL_LABEL[c]}</label>)}</div>
            <strong className="t-subheadline">Row height</strong>
            <div style={{ marginTop: 8 }}><Seg label="Row height" value={density} onChange={setDens} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]} /></div>
          </Popover>
          {!tablet && <Button variant="icon" aria-label={inspect ? 'Hide inspector' : 'Show inspector'} aria-pressed={inspect} onClick={() => setInspect((v) => !v)}><SlidersHorizontal size={18} strokeWidth={1.75} /></Button>}
        </>}
      </div>

      {checked.size > 0 && canWrite && (
        <div className="card anim-pop" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', marginBottom: 12 }} role="toolbar" aria-label="Bulk actions">
          <span className="t-callout num">{checked.size} selected</span><Button small onClick={() => bulk('save')}>Save</Button><Button small onClick={() => bulk('pass')}>Pass</Button><Button small onClick={() => bulk('pipeline')}>Add to pipeline</Button>
          <Button small variant="plain" onClick={() => setChecked(new Set())}><X size={14} aria-hidden />Clear</Button>
        </div>
      )}

      {q.isError ? <ErrorState body={(q.error as Error).message} retry={() => q.refetch()} /> : q.isLoading ? <SkeletonRows n={10} /> : rows.length === 0 ? (
        <Empty icon={Inbox} title="No opportunities match" body={filters.tab === 'all' && !filters.q ? 'Nothing has been synced yet, or your filters exclude everything. Check Settings → Data sync.' : 'Try removing a filter or switching to “All”.'} action={<Button variant="primary" onClick={() => apply(emptyFilters())}>Clear filters</Button>} />
      ) : mobile ? (
        <MobileList rows={rows} grouped={filters.tab === 'all'} />
      ) : view === 'card' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 16 }}>{rows.map((o) => <OpportunityCard key={o.id} o={o} actions={actions} />)}{q.hasNextPage && <div style={{ gridColumn: '1/-1', textAlign: 'center' }}><Button onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button></div>}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: showInspector ? 'minmax(0,1fr) var(--inspector-w)' : '1fr', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ overflow: 'hidden' }} data-density={density}>
            <div ref={scroller} style={{ height: 'calc(100dvh - 300px)', minHeight: 360, overflow: 'auto' }}>
              <table className="fp-table" style={{ tableLayout: 'fixed', width: visibleCols.reduce((n, c) => n + widths[c], canWrite ? 40 : 0), minWidth: '100%' }} role="grid" aria-rowcount={total ?? rows.length} aria-label="Opportunities">
                <colgroup>{canWrite && <col style={{ width: 40 }} />}{visibleCols.map((c) => <col key={c} style={{ width: widths[c] }} />)}</colgroup>
                <thead><tr>{canWrite && <th scope="col"><input type="checkbox" aria-label="Select all loaded" checked={checked.size === rows.length && rows.length > 0} onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                  {table.getHeaderGroups()[0].headers.map((h) => { const c = h.column.id as ColId; const sk = SORTABLE[c]; const active = sk && sort.key === sk; return <th key={h.id} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>{sk ? <button type="button" onClick={() => toggleSort(c)} style={{ background: 'none', border: 0, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 2, fontWeight: 500, color: active ? 'var(--label-primary)' : 'inherit' }}>{COL_LABEL[c]}{active && (sort.dir === 'asc' ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />)}</button> : COL_LABEL[c]}</th> })}</tr></thead>
                <tbody>
                  {items.length > 0 && items[0].start > 0 && <tr aria-hidden><td colSpan={visibleCols.length + (canWrite ? 1 : 0)} style={{ height: items[0].start, padding: 0, border: 0 }} /></tr>}
                  {items.map((v) => { const o = rows[v.index]; return (
                    <tr key={o.id} data-idx={v.index} aria-selected={v.index === sel} aria-rowindex={v.index + 2} style={{ height: rowH, cursor: 'default', opacity: o.co?.workflow_status === 'pass' ? 0.55 : 1 }} onClick={() => setSel(v.index)} onDoubleClick={() => router.push(`/opportunities/${o.id}`)}>
                      {canWrite && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${o.title}`} checked={checked.has(o.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} /></td>}
                      {visibleCols.map((c) => <td key={c}>{cell(o, c)}</td>)}
                    </tr>) })}
                  {items.length > 0 && <tr aria-hidden><td colSpan={visibleCols.length + (canWrite ? 1 : 0)} style={{ height: Math.max(0, virt.getTotalSize() - items[items.length - 1].end), padding: 0, border: 0 }} /></tr>}
                </tbody>
              </table>
              {q.isFetchingNextPage && <div className="t-footnote" style={{ padding: 12, textAlign: 'center', color: 'var(--label-secondary)' }}>Loading more…</div>}
            </div>
          </div>
          {showInspector && cur && <aside aria-label="Inspector" style={{ position: 'sticky', top: 0 }}><div className="t-caption" style={{ color: 'var(--label-secondary)', margin: '0 4px 8px' }}>Inspector</div><OpportunityCard o={cur} actions={actions} /></aside>}
        </div>
      )}

      <AiSearchSheet open={aiOpen} onOpenChange={setAiOpen} enabled={true} onApply={(f) => apply(FiltersSchema.parse(f))} />
      <SaveSearchSheet open={saveOpen} onOpenChange={setSaveOpen} filters={filters} />
    </>
  )
}

function MobileList({ rows, grouped }: { rows: OppRow[]; grouped: boolean }) {
  const groups = grouped ? (['GREEN', 'YELLOW', 'RED'] as const).map((l) => ({ l, rows: rows.filter((r) => r.color_label === l) })).filter((g) => g.rows.length) : [{ l: null, rows }]
  const title = { GREEN: 'Bid-ready', YELLOW: 'Watch', RED: 'Awarded / not bid-ready' }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {groups.map((g) => (
        <section key={g.l ?? 'all'} aria-label={g.l ? title[g.l] : 'Opportunities'}>
          {g.l && <h2 className="t-caption" style={{ color: 'var(--label-secondary)', margin: '0 0 8px 4px' }}>{title[g.l]}</h2>}
          <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }}>
            {g.rows.map((o) => (
              <li key={o.id} className="hairline-b"><Link href={`/opportunities/${o.id}`} style={{ display: 'grid', gap: 4, padding: '12px 16px', minHeight: 44, color: 'inherit' }}>
                <span className="t-callout" style={{ fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{o.title}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="t-footnote" style={{ color: 'var(--label-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orUnknown(o.sub_tier ?? o.department)}</span>{!grouped && <ColorPill label={o.color_label} />}<CountdownChip deadline={o.response_deadline} /></span>
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function SaveSearchSheet({ open, onOpenChange, filters }: { open: boolean; onOpenChange: (o: boolean) => void; filters: Filters }) {
  const [name, setName] = useState('')
  const [alerts, setAlerts] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const { toast } = useToast()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Save search" description="Fieldpoint runs it against new notices after each sync.">
      <form style={{ display: 'grid', gap: 16 }} onSubmit={async (e) => { e.preventDefault(); const r = await saveSearch({ name, filters, alertsEnabled: alerts }); if (!r.ok) return setErr(r.error); toast('Search saved'); onOpenChange(false); setName('') }}>
        <div><label className="field-label" htmlFor="ssn">Name</label><input id="ssn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Army hydraulic RFQs" /></div>
        <label className="t-callout" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />Alert me when new notices match</label>
        {err && <p role="alert" className="field-error">{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="plain" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={!name.trim()}>Save</Button></div>
      </form>
    </Sheet>
  )
}

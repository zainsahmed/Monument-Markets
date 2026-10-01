'use client'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import * as D from '@radix-ui/react-dialog'
import { emit } from './keys'
import { ColorPill } from '@/components/ui/chips'
import type { OppRow } from '@/lib/data/opportunities'

const PAGES: Array<[string, string]> = [['Dashboard', '/dashboard'], ['Opportunities — Bid-ready', '/opportunities?tab=bid_ready'], ['Opportunities — Watch', '/opportunities?tab=watch'], ['Opportunities — Awarded', '/opportunities?tab=awarded'], ['Opportunities — Saved', '/opportunities?saved=1'], ['Pipeline', '/pipeline'], ['Suppliers', '/suppliers'], ['Alerts', '/alerts'], ['Saved searches', '/searches'], ['Import DIBBS RFQ', '/import'], ['Company profile', '/company'], ['Settings', '/settings']]

/** ⌘K: jump to pages, run actions, and search opportunities (reads the database through /api/opportunities). */
export function CommandPalette({ open, onOpenChange, onNavigate }: { open: boolean; onOpenChange: (o: boolean) => void; onNavigate: (href: string) => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(t) }, [q])
  useEffect(() => { if (!open) setQ('') }, [open])
  const needle = q.trim().toLowerCase()
  const match = (label: string) => !needle || label.toLowerCase().includes(needle)
  const { data, isFetching } = useQuery({
    queryKey: ['palette', debounced], enabled: open && debounced.length >= 2,
    queryFn: async () => { const r = await fetch(`/api/opportunities?q=${encodeURIComponent(debounced)}&limit=8`); if (!r.ok) throw new Error('search failed'); return (await r.json()) as { rows: OppRow[] } },
  })
  const actions = [['Analyze opportunity', () => { onOpenChange(false); emit('fp:analyze') }], ['New supplier', () => onNavigate('/suppliers?new=1')], ['Import DIBBS RFQ', () => onNavigate('/import')], ['AI search…', () => { onOpenChange(false); emit('fp:ai-search') }]] as const
  const shownActions = actions.filter(([l]) => match(l))
  const shownPages = PAGES.filter(([l]) => match(l))
  const noResults = (data?.rows?.length ?? 0) === 0 && shownActions.length === 0 && shownPages.length === 0
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 90 }} />
        <D.Content aria-label="Command palette" className="floating anim-pop" style={{ position: 'fixed', zIndex: 91, left: '50%', top: '14vh', transform: 'translateX(-50%)', width: 'min(600px, calc(100vw - 24px))', padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
          <D.Title className="sr-only">Command palette</D.Title><D.Description className="sr-only">Search opportunities, jump to pages or run actions</D.Description>
          <Command label="Command palette" shouldFilter={false}>
            <Command.Input value={q} onValueChange={setQ} placeholder="Search opportunities, pages, actions…" style={{ width: '100%', height: 52, padding: '0 20px', border: 0, borderBottom: '0.5px solid var(--separator)', background: 'transparent', color: 'var(--label-primary)', fontSize: 17, outline: 'none' }} />
            <Command.List style={{ maxHeight: 'min(420px, 60dvh)', overflow: 'auto', padding: 8 }}>
              {noResults && <p className="t-callout" role="status" style={{ padding: 24, textAlign: 'center', color: 'var(--label-secondary)', margin: 0 }}>{isFetching ? 'Searching…' : 'No results.'}</p>}
              {(data?.rows?.length ?? 0) > 0 && (
                <Command.Group heading="Opportunities">
                  {data!.rows.map((o) => (
                    <Command.Item key={o.id} value={`opp-${o.id}-${o.title}`} onSelect={() => onNavigate(`/opportunities/${o.id}`)} className="cmd-item">
                      <ColorPill label={o.color_label} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</span><span className="t-footnote mono" style={{ color: 'var(--label-secondary)' }}>{o.solicitation_number}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {shownActions.length > 0 && <Command.Group heading="Actions">{shownActions.map(([l, fn]) => <Command.Item key={l} value={`action ${l}`} className="cmd-item" onSelect={fn}>{l}</Command.Item>)}</Command.Group>}
              {shownPages.length > 0 && <Command.Group heading="Go to">{shownPages.map(([l, h]) => <Command.Item key={h} value={`go ${l}`} className="cmd-item" onSelect={() => onNavigate(h)}>{l}</Command.Item>)}</Command.Group>}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

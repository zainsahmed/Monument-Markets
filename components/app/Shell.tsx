'use client'
import { Bell, Building2, Command, FileInput, KanbanSquare, LayoutDashboard, LogOut, Menu, MoreHorizontal, PanelLeft, Search, Settings, Truck, BookmarkCheck, Star, Eye, Trophy, Target, X, Keyboard, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Dialog'
import { ToastProvider } from '@/components/ui/Toast'
import { Wordmark } from './Wordmark'
import { CommandPalette } from './CommandPalette'
import { emit } from './keys'

export interface ShellCounts { bidReady: number; watch: number; awarded: number; saved: number; unread: number }
interface Item { href: string; label: string; icon: LucideIcon; count?: number; match: (p: string, tab: string | null, saved: boolean) => boolean; badge?: boolean }

const SHORTCUTS: Array<[string, string]> = [['⌘K / Ctrl K', 'Command palette'], ['J / K', 'Next / previous row'], ['Enter', 'Open selected'], ['S', 'Save / unsave'], ['P', 'Pass'], ['A', 'Analyze opportunity'], ['⌘/ / Ctrl /', 'Show this list'], ['Esc', 'Close panels']]

function Nav({ counts, collapsed, onNavigate }: { counts: ShellCounts; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname()
  const sp = useSearchParams()
  const tab = sp.get('tab')
  const saved = sp.get('saved') === '1'
  const opp = (p: string) => p.startsWith('/opportunities')
  const sections: Array<{ title?: string; items: Item[] }> = [
    { items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' }] },
    { title: 'Opportunities', items: [
      { href: '/opportunities?tab=bid_ready', label: 'Bid-ready', icon: Target, count: counts.bidReady, match: (p, t) => opp(p) && t === 'bid_ready' },
      { href: '/opportunities?tab=watch', label: 'Watch', icon: Eye, count: counts.watch, match: (p, t) => opp(p) && t === 'watch' },
      { href: '/opportunities?tab=awarded', label: 'Awarded', icon: Trophy, count: counts.awarded, match: (p, t) => opp(p) && t === 'awarded' },
      { href: '/opportunities?saved=1', label: 'Saved', icon: Star, count: counts.saved, match: (p, _t, s) => opp(p) && s },
    ] },
    { items: [
      { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare, match: (p) => p.startsWith('/pipeline') },
      { href: '/suppliers', label: 'Suppliers', icon: Truck, match: (p) => p.startsWith('/suppliers') },
      { href: '/alerts', label: 'Alerts', icon: Bell, count: counts.unread, badge: true, match: (p) => p.startsWith('/alerts') },
      { href: '/searches', label: 'Saved searches', icon: BookmarkCheck, match: (p) => p.startsWith('/searches') },
      { href: '/import', label: 'Import DIBBS', icon: FileInput, match: (p) => p.startsWith('/import') },
    ] },
    { items: [
      { href: '/company', label: 'Company profile', icon: Building2, match: (p) => p.startsWith('/company') },
      { href: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
    ] },
  ]
  return (
    <nav aria-label="Primary" style={{ padding: '8px 12px', display: 'grid', gap: 2, alignContent: 'start' }}>
      {sections.map((sec, i) => (
        <div key={i} style={{ display: 'grid', gap: 2 }}>
          {sec.title && !collapsed && <div className="side-heading">{sec.title}</div>}
          {sec.items.map((it) => {
            const current = it.match(path, tab, saved)
            const href = it.href
            return (
              <Link key={it.href} href={href} onClick={onNavigate} className="side-item" aria-current={current ? 'page' : undefined} title={collapsed ? it.label : undefined} aria-label={collapsed ? `${it.label}${it.count ? `, ${it.count}` : ''}` : undefined}>
                <it.icon size={16} strokeWidth={1.75} aria-hidden />
                {!collapsed && <span className="side-label">{it.label}</span>}
                {!collapsed && it.count !== undefined && (it.badge ? (it.count > 0 && <span className="badge tone-accent num" style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'var(--accent-contrast)' }}>{it.count}</span>) : <span className="count">{it.count.toLocaleString()}</span>)}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function useScrolled(threshold = 56) {
  const [s, setS] = useState(false)
  useEffect(() => {
    const el = document.getElementById('fp-main')
    const fn = () => setS((el?.scrollTop ?? 0) > threshold)
    el?.addEventListener('scroll', fn, { passive: true })
    return () => el?.removeEventListener('scroll', fn)
  }, [threshold])
  return s
}

export function Shell({ counts, user, role, children }: { counts: ShellCounts; user: { email: string | null }; role: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const [more, setMore] = useState(false)
  const router = useRouter()
  const path = usePathname()
  const scrolled = useScrolled()

  useEffect(() => { try { setCollapsed(localStorage.getItem('fp-sidebar') === '1') } catch { /* private mode */ } }, [])
  const toggle = useCallback(() => setCollapsed((c) => { try { localStorage.setItem('fp-sidebar', c ? '0' : '1') } catch { /* ignore */ } return !c }), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return }
      if (mod && e.key === '/') { e.preventDefault(); setHelp((h) => !h); return }
      const t = e.target as HTMLElement | null
      if (mod || e.altKey || t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      if (['j', 'k', 's', 'p', 'a', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) emit('fp:key', { key: e.key.toLowerCase() === e.key ? e.key : e.key, event: e })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = path === '/dashboard' ? 'Dashboard' : path.startsWith('/opportunities/') ? 'Opportunity' : path.startsWith('/opportunities') ? 'Opportunities' : path.startsWith('/pipeline') ? 'Pipeline' : path.startsWith('/suppliers') ? 'Suppliers' : path.startsWith('/alerts') ? 'Alerts' : path.startsWith('/searches') ? 'Saved searches' : path.startsWith('/company') ? 'Company profile' : path.startsWith('/settings') ? 'Settings' : path.startsWith('/import') ? 'Import DIBBS' : ''

  const tabs: Array<{ href: string; label: string; icon: LucideIcon; badge?: number }> = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { href: '/opportunities?tab=bid_ready', label: 'Opportunities', icon: Target },
    { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare }, { href: '/alerts', label: 'Alerts', icon: Bell, badge: counts.unread },
  ]

  return (
    <ToastProvider>
      <a href="#fp-main" className="sr-only">Skip to content</a>
      <div className="fp-shell" data-collapsed={collapsed}>
        <aside className="fp-sidebar material-sidebar hairline-r" aria-label="Sidebar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', height: 'var(--toolbar-h)', padding: collapsed ? 0 : '0 20px' }}>{collapsed ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-label="Fieldpoint"><circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="1.6" /><circle cx="12" cy="12" r="3" fill="var(--accent)" /></svg> : <Wordmark />}</div>
          <Suspense fallback={null}><Nav counts={counts} collapsed={collapsed} /></Suspense>
        </aside>
        <div className="fp-body">
          <header className="fp-toolbar material-toolbar hairline-b">
            <Button variant="icon" className="fp-hide-mobile" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggle}><PanelLeft size={18} strokeWidth={1.75} /></Button>
            <span className="fp-hide-desktop"><Wordmark size={17} /></span>
            <h2 className="t-headline fp-toolbar-title" style={{ margin: 0, opacity: scrolled ? 1 : 0, transition: 'opacity var(--dur-fast) var(--ease)' }} aria-hidden={!scrolled}>{title}</h2>
            <div style={{ flex: 1 }} />
            <button type="button" className="fp-search" onClick={() => setPalette(true)} title="Search and commands (Command K)">
              <Search size={14} strokeWidth={1.75} aria-hidden /><span className="fp-hide-mobile">Search</span><span className="sr-only fp-hide-desktop">Search</span>
              <kbd className="fp-hide-mobile"><Command size={10} aria-hidden />K</kbd>
            </button>
            <Button variant="icon" className="fp-hide-mobile" aria-label="Keyboard shortcuts" onClick={() => setHelp(true)}><Keyboard size={18} strokeWidth={1.75} /></Button>
          </header>
          <main id="fp-main" className="fp-main" tabIndex={-1}>
            <div className="fp-content">{children}</div>
          </main>
        </div>
        <nav className="fp-tabbar material-toolbar hairline-t" aria-label="Main tabs">
          {tabs.map((t) => {
            const active = path.startsWith(t.href.split('?')[0])
            return (
              <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className="fp-tab">
                <span style={{ position: 'relative' }}><t.icon size={22} strokeWidth={1.5} aria-hidden />{!!t.badge && <span className="badge num" style={{ position: 'absolute', top: -6, right: -12, height: 16, background: 'var(--accent)', color: 'var(--accent-contrast)' }}>{t.badge}</span>}</span>
                <span>{t.label}</span>
              </Link>
            )
          })}
          <button type="button" className="fp-tab" onClick={() => setMore(true)} aria-haspopup="dialog"><MoreHorizontal size={22} strokeWidth={1.5} aria-hidden /><span>More</span></button>
        </nav>
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} onNavigate={(href) => { setPalette(false); router.push(href) }} />
      <Sheet open={help} onOpenChange={setHelp} title="Keyboard shortcuts" width={420}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 24px', margin: 0 }}>
          {SHORTCUTS.map(([k, d]) => (<div key={k} style={{ display: 'contents' }}><dt><kbd className="mono">{k}</kbd></dt><dd className="t-callout" style={{ margin: 0 }}>{d}</dd></div>))}
        </dl>
      </Sheet>
      <Sheet open={more} onOpenChange={setMore} title="More" width={420}>
        <div style={{ display: 'grid', gap: 4 }}>
          {[['/suppliers', 'Suppliers'], ['/searches', 'Saved searches'], ['/import', 'Import DIBBS RFQ'], ['/company', 'Company profile'], ['/settings', 'Settings']].map(([h, l]) => (<Link key={h} href={h} className="side-item" style={{ height: 44 }} onClick={() => setMore(false)}>{l}</Link>))}
          <form action="/auth/signout" method="post"><button className="side-item" style={{ height: 44, width: '100%', background: 'none', border: 0, textAlign: 'left' }}><LogOut size={16} aria-hidden /> Sign out ({user.email ?? role})</button></form>
        </div>
      </Sheet>
    </ToastProvider>
  )
}

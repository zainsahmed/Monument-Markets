'use client'
import { Mail, Phone } from 'lucide-react'
import Link from 'next/link'
import { ColorPill } from '@/components/ui/chips'
import { InfoNote } from '@/components/ui/chips'
import { fmtDate, fmtDeadline, fmtMoney, orUnknown } from '@/lib/format'
import type { DetailData } from '@/lib/data/detail'

const place = (o: DetailData['opp']) => [o.pop_city, o.pop_state, o.pop_zip, o.pop_country].filter(Boolean).join(', ')

export function OverviewTab({ d, descriptionHtml }: { d: DetailData; descriptionHtml: string; canWrite: boolean }) {
  const o = d.opp
  const rows: Array<[string, React.ReactNode]> = [
    ['Source', o.source === 'SAM' ? 'SAM.gov' : 'DLA DIBBS (imported)'], ['Notice ID', <span key="n" className="mono">{o.notice_id}</span>], ['Solicitation number', <span key="s" className="mono">{orUnknown(o.solicitation_number)}</span>],
    ['Notice type', orUnknown(o.notice_type)], ['Department', orUnknown(o.department)], ['Sub-tier', orUnknown(o.sub_tier)], ['Office', orUnknown(o.office)],
    ['Posted', fmtDate(o.posted_date)], ['Response deadline', fmtDeadline(o.response_deadline, o.response_deadline_raw)], ['Archive date', fmtDate(o.archive_date)],
    ['NAICS', <span key="na" className="num">{orUnknown(o.naics)}</span>], ['PSC', <span key="p" className="num">{orUnknown(o.psc)}</span>], ['Set-aside', orUnknown(o.set_aside ? `${o.set_aside}${o.set_aside_code ? ` (${o.set_aside_code})` : ''}` : o.set_aside_code)],
    ['Place of performance', orUnknown(place(o))], ['Stated value', o.value_amount ? fmtMoney(o.value_amount) : 'Unknown'], ['Status', o.cancelled ? 'Cancelled' : o.active ? 'Active' : 'Inactive'],
  ]
  if (o.dibbs) for (const [k, v] of Object.entries(o.dibbs)) if (k !== 'missing') rows.push([`DIBBS · ${k.replace(/_/g, ' ')}`, v === null || v === '' || (Array.isArray(v) && !v.length) ? 'Unknown' : typeof v === 'object' ? (Array.isArray(v) ? v.map((x) => (x as { cage: string; part_number: string | null }).cage ? `${(x as { cage: string }).cage}${(x as { part_number: string | null }).part_number ? ` (P/N ${(x as { part_number: string }).part_number})` : ''}` : String(x)).join(', ') : JSON.stringify(v)) : String(v)])
  const contacts = (o.contacts ?? []) as Array<Record<string, string | null>>
  const award = o.award as { date?: string; number?: string; amount?: string | number; awardee?: { name?: string; ueiSAM?: string } } | null
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {d.chain.length > 1 && (
        <section className="card" style={{ padding: 16 }} aria-label="Notice chain">
          <h2 className="t-headline" style={{ margin: '0 0 8px' }}>Notice chain · {o.solicitation_number}</h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {d.chain.map((c, i) => <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{i > 0 && <span aria-hidden style={{ color: 'var(--label-tertiary)' }}>→</span>}<Link href={`/opportunities/${c.id}`} aria-current={c.id === o.id ? 'page' : undefined} className="chip" style={{ fontWeight: c.id === o.id ? 600 : 400 }}>{orUnknown(c.notice_type)} · {fmtDate(c.posted_date)}</Link><ColorPill label={c.color_label} /></li>)}
          </ol>
          <p className="t-footnote" style={{ color: 'var(--label-secondary)', margin: '8px 0 0' }}>Related notices share a solicitation number (presolicitation → solicitation → amendments → award).</p>
        </section>
      )}
      {o.notice_type_code === 'a' && <div role="note" className="card" style={{ padding: 12, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}><strong>This is an Award Notice, not a bid opportunity.</strong></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 24, alignItems: 'start' }}>
        <section className="card" style={{ padding: 16 }} aria-label="Stored fields">
          <h2 className="t-headline" style={{ margin: '0 0 12px' }}>Details</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: '8px 16px', margin: 0 }}>
            {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="t-callout" style={{ color: 'var(--label-secondary)' }}>{k}</dt><dd className="t-callout" style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd></div>)}
          </dl>
        </section>
        <div style={{ display: 'grid', gap: 24 }}>
          {award && (
            <section className="card" style={{ padding: 16 }} aria-label="Award"><h2 className="t-headline" style={{ margin: '0 0 8px' }}>Award</h2>
              <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px', margin: 0 }} className="t-callout">
                <dt style={{ color: 'var(--label-secondary)' }}>Awardee</dt><dd style={{ margin: 0 }}>{orUnknown(award.awardee?.name)}</dd><dt style={{ color: 'var(--label-secondary)' }}>Date</dt><dd style={{ margin: 0 }}>{fmtDate(award.date ?? null)}</dd><dt style={{ color: 'var(--label-secondary)' }}>Amount</dt><dd className="num" style={{ margin: 0 }}>{award.amount ? fmtMoney(Number(award.amount)) : 'Unknown'}</dd>
              </dl></section>
          )}
          <section className="card" style={{ padding: 16 }} aria-label="Contacts">
            <h2 className="t-headline" style={{ margin: '0 0 8px' }}>Contacts</h2>
            {contacts.length === 0 ? <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>Unknown</p> : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>{contacts.map((c, i) => (
              <li key={i} className="t-callout"><strong>{orUnknown(c.fullName ?? c.fullname)}</strong> <span style={{ color: 'var(--label-secondary)' }}>{orUnknown(c.type ?? c.title)}</span>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: 'var(--label-secondary)' }}>{c.email && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Mail size={13} aria-hidden />{c.email}</span>}{c.phone && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Phone size={13} aria-hidden />{c.phone}</span>}</div></li>))}</ul>}
            <div style={{ marginTop: 12 }}><InfoNote>Display only. Fieldpoint never emails or messages government contacts, and never represents your company to the government.</InfoNote></div>
          </section>
        </div>
      </div>
      <section className="card" style={{ padding: 16 }} aria-label="Description">
        <h2 className="t-headline" style={{ margin: '0 0 12px' }}>Description</h2>
        {descriptionHtml ? <div className="rich t-body" style={{ overflowWrap: 'anywhere' }} dangerouslySetInnerHTML={{ __html: descriptionHtml }} /> : <p className="t-callout" style={{ margin: 0, color: 'var(--label-secondary)' }}>{o.source === 'SAM' ? 'The description hasn’t been retrieved from SAM.gov yet. It’s fetched on demand to save API quota — open the Documents tab and choose “Fetch from SAM.gov”.' : 'Unknown'}</p>}
      </section>
    </div>
  )
}

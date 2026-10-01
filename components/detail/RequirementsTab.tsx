'use client'
import { ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty } from '@/components/ui/states'
import { LabelChip } from '@/components/ui/chips'
import type { DetailData } from '@/lib/data/detail'
import { CiteMark, type DocNames } from './Statement'

const TITLES: Record<string, string> = {
  'requirement:certifications': 'Certifications', 'requirement:licenses': 'Licenses', 'requirement:past_performance': 'Past performance', 'requirement:security_clearance': 'Security clearance', 'requirement:approved_source': 'Approved source / manufacturer',
  'requirement:domestic_sourcing': 'Domestic sourcing', 'requirement:delivery': 'Delivery', 'requirement:insurance_bonding': 'Insurance & bonding', 'requirement:technical': 'Technical', 'requirement:other': 'Other requirements',
  statement_of_work: 'Statement of work', specification: 'Specifications', quantity: 'Quantities', delivery_schedule: 'Delivery schedule', period_of_performance: 'Period of performance', evaluation_basis: 'Basis of award', evaluation_factor: 'Evaluation factors',
  instructions_to_offerors: 'Instructions to offerors', required_form: 'Required forms', required_certification: 'Required certifications & representations', pricing_instructions: 'Pricing instructions', questions_deadline: 'Questions deadline', submission_method: 'Submission method', amendment_change: 'Amendments',
}
const ORDER = Object.keys(TITLES)

export function RequirementsTab({ d, docNames, goTab }: { d: DetailData; docNames: DocNames; goTab: (t: string) => void }) {
  // Collapse one-row-per-citation back into statements.
  const stmts = new Map<string, { category: string; text: string; label: 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION'; cites: Array<{ documentId: string; page: number; section: string; snippet: string }> }>()
  for (const f of d.facts) {
    if (!(f.category.startsWith('requirement:') || TITLES[f.category])) continue
    const k = `${f.analysis_id}|${f.category}|${f.text}`
    const s = stmts.get(k) ?? { category: f.category, text: f.text, label: f.label, cites: [] }
    if (f.snippet) s.cites.push({ documentId: f.document_id ?? `notice:${d.opp.id}`, page: f.page ?? 0, section: f.section ?? '', snippet: f.snippet })
    stmts.set(k, s)
  }
  const groups = ORDER.map((c) => [c, [...stmts.values()].filter((s) => s.category === c)] as const).filter(([, l]) => l.length)
  const ext = d.extraction?.output.extraction
  if (!groups.length && !ext?.clins.length && !ext?.clauses.length) return <Empty icon={ListChecks} title="No requirements extracted yet" body="Run an AI analysis or document extraction. Every requirement shows a label and a citation you can open in the document." action={<Button variant="primary" onClick={() => goTab('ai')}>Go to AI Analysis</Button>} />
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {ext?.basis_of_award && ext.basis_of_award !== 'UNKNOWN' && <p className="t-callout" style={{ margin: 0 }}><strong>Basis of award:</strong> {ext.basis_of_award === 'LPTA' ? 'Lowest price technically acceptable' : ext.basis_of_award === 'BEST_VALUE' ? 'Best value tradeoff' : 'Other'} <LabelChip label="ANALYSIS" /></p>}
      {groups.map(([cat, list]) => (
        <section key={cat} className="card" style={{ padding: 16 }} aria-label={TITLES[cat]}>
          <h2 className="t-headline" style={{ margin: '0 0 8px' }}>{TITLES[cat]}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {list.map((s, i) => <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><p className="t-body" style={{ margin: 0, flex: 1 }}>{s.text}{s.cites.map((c, j) => <CiteMark key={j} n={j + 1} c={c} docNames={docNames} />)}</p><span style={{ flex: 'none', marginTop: 2 }}><LabelChip label={s.label} /></span></li>)}
          </ul>
        </section>
      ))}
      {!!ext?.clins.length && (
        <section className="card" style={{ padding: 16, overflow: 'auto' }} aria-label="CLINs"><h2 className="t-headline" style={{ margin: '0 0 8px' }}>CLINs</h2>
          <table className="fp-table"><thead><tr>{['CLIN', 'Description', 'Quantity', 'Unit', 'Source'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{ext.clins.map((c, i) => <tr key={i}><td className="mono">{c.number || 'Unknown'}</td><td style={{ whiteSpace: 'normal' }}>{c.description || 'Unknown'}</td><td className="num">{c.quantity || 'Unknown'}</td><td>{c.unit || 'Unknown'}</td><td>{c.citation ? <CiteMark n={1} c={c.citation} docNames={docNames} /> : <LabelChip label="NEEDS_VERIFICATION" />}</td></tr>)}</tbody></table>
        </section>
      )}
      {!!ext?.clauses.length && (
        <section className="card" style={{ padding: 16, overflow: 'auto' }} aria-label="Clauses"><h2 className="t-headline" style={{ margin: '0 0 8px' }}>FAR / DFARS clauses</h2>
          <table className="fp-table"><thead><tr>{['Clause', 'Title', 'Source'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{ext.clauses.map((c, i) => <tr key={i}><td className="mono">{c.number}</td><td style={{ whiteSpace: 'normal' }}>{c.title || 'Unknown'}</td><td>{c.citation ? <CiteMark n={1} c={c.citation} docNames={docNames} /> : <LabelChip label="NEEDS_VERIFICATION" />}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  )
}

/**
 * QA-ONLY fake of the Anthropic Messages streaming endpoint. It answers with schema-valid structured JSON that quotes
 * REAL sentences from the <document> blocks it receives (plus one deliberately invalid citation), so the app's real
 * request building, streaming parse, Zod validation, citation verification, downgrade logic and persistence all run.
 * It does NOT test model quality — no model is involved.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.QA_ANTHROPIC_PORT ?? 54401)
export const requests: Array<Record<string, any>> = []

interface Doc { id: string; name: string; pages: Array<{ page: number; section: string; text: string }> }
function parseDocs(content: string): Doc[] {
  const docs: Doc[] = []
  for (const m of content.matchAll(/<document id="([^"]+)" name="([^"]*)"[^>]*>\n([\s\S]*?)\n<\/document>/g)) {
    const pages: Doc['pages'] = []
    for (const pm of m[3].matchAll(/\[\[(page (\d+)|section: ([^\]]*)|sheet: ([^\]]*))\]\]\n([\s\S]*?)(?=\n\n\[\[|$)/g)) pages.push({ page: pm[2] ? Number(pm[2]) : 0, section: pm[3] ?? pm[4] ?? '', text: pm[5] })
    docs.push({ id: m[1], name: m[2], pages })
  }
  return docs
}
const sentence = (t: string) => (t.split(/\n/).map((l) => l.trim()).find((l) => l.length >= 30 && l.length <= 220) ?? t.trim().slice(0, 120))

function cite(d: Doc | undefined, pageIdx = 0, snippet?: string) {
  if (!d) return []
  const p = d.pages[Math.min(pageIdx, d.pages.length - 1)]
  return [{ documentId: d.id, page: p.page, section: p.section, snippet: snippet ?? sentence(p.text) }]
}
const st = (text: string, label: 'VERIFIED' | 'ANALYSIS' | 'NEEDS_VERIFICATION', citations: unknown[] = []) => ({ text, label, citations })

function brief(task: string, docs: Doc[]) {
  const notice = docs.find((d) => d.id.startsWith('notice:'))
  const file = docs.find((d) => !d.id.startsWith('notice:'))
  const keys = [...task.matchAll(/^- ([a-z0-9_]+): /gm)].map((m) => m[1])
  const bogus = { documentId: file?.id ?? notice?.id ?? 'x', page: file ? 1 : 0, section: '', snippet: 'Offerors must hold an active TOP SECRET facility clearance at the time of award' }
  const noticeLine = notice ? notice.pages[0].text.split('\n').find((l) => l.startsWith('Solicitation number:')) ?? 'Title:' : 'Title:'
  return {
    what_they_want: [st('The government wants to buy the items described in the stored notice and attached specification.', 'VERIFIED', cite(notice, 0, notice?.pages[0].text.split('\n')[0])), st('Delivery and packaging terms in the attachment drive the effort.', 'ANALYSIS')],
    what_we_provide: [{ ...st('Supply the items listed in the solicitation.', 'VERIFIED', cite(file ?? notice)), category: 'product_service' }, { ...st('Quantity is stated in the CLIN.', 'NEEDS_VERIFICATION'), category: 'quantity' }],
    key_dates: [{ ...st('Offers are due on the response deadline in the notice record.', 'VERIFIED', cite(notice, 0, notice?.pages[0].text.split('\n').find((l) => l.startsWith('Response deadline:')))), kind: 'offers_due', value: 'See notice record' }, { ...st('No questions deadline is stated.', 'NEEDS_VERIFICATION'), kind: 'questions_due', value: '' }],
    contract_details: [{ ...st('Solicitation number as recorded.', 'VERIFIED', cite(notice, 0, noticeLine)), field: 'agency', value: 'Department of Defense' }, { ...st('No contract value is stated.', 'NEEDS_VERIFICATION'), field: 'estimated_value', value: '' }],
    requirements: [{ ...st('First article testing is mentioned in the attachment.', 'VERIFIED', cite(file)), category: 'technical' }, { ...st('Top secret clearance is required (this citation is deliberately wrong).', 'VERIFIED', [bogus]), category: 'security_clearance' }],
    defense_flags: [{ ...st('Packaging and marking requirements appear in the attachment.', 'VERIFIED', cite(file)), flag: 'military_packaging_marking', status: 'REQUIRED' }, { ...st('Berry Amendment is not mentioned in the available text.', 'VERIFIED', cite(notice)), flag: 'berry_amendment', status: 'NOT_MENTIONED' }, { ...st('CMMC level cannot be determined from the text.', 'ANALYSIS'), flag: 'cmmc', status: 'UNCLEAR' }],
    potential_problems: [st('Your SPRS assessment date should be checked against any DFARS 7012 requirement.', 'ANALYSIS')],
    missing_information: [st('No quantity or unit price is stated in the notice record.', 'NEEDS_VERIFICATION')],
    next_steps: [st('Request a quote from the manufacturer for the listed part number.', 'ANALYSIS'), st('Confirm SPRS score is current.', 'ANALYSIS')],
    fit: { ai_fit: 'Medium', fit_rationale: 'The NAICS matches the profile, but supplier availability and compliance items are still unknown.', complexity: 'Medium', complexity_rationale: 'Defense packaging and testing requirements add work beyond a simple resale.' },
    checklist_suggestions: keys.filter((k) => ['sam_registration', 'naics_compatible', 'first_article', 'can_source'].includes(k)).map((key) => ({ key, status: key === 'first_article' ? 'UNKNOWN' : 'PASS', rationale: st(key === 'first_article' ? 'The attachment mentions first article testing; capability is unknown.' : 'Profile appears to satisfy this item.', key === 'naics_compatible' ? 'VERIFIED' : 'ANALYSIS', key === 'naics_compatible' ? cite(notice, 0, notice?.pages[0].text.split('\n').find((l) => l.startsWith('NAICS:'))) : []) })),
  }
}
function extraction(docs: Doc[]) {
  const file = docs.find((d) => !d.id.startsWith('notice:')) ?? docs[0]
  return { facts: [{ ...st('Deliveries are required after receipt of order.', 'VERIFIED', cite(file, 0)), category: 'delivery_schedule' }, { ...st('Quantities are stated per CLIN.', 'ANALYSIS'), category: 'quantity' }], clins: [{ number: '0001', description: 'Item as described', quantity: '', unit: 'EA', citation: cite(file)[0] ?? { documentId: 'x', page: 0, section: '', snippet: 'none' } }], clauses: [{ number: '52.212-1', title: 'Instructions to Offerors—Commercial Products and Commercial Services', citation: { documentId: file.id, page: 1, section: '', snippet: 'Instructions to Offerors that are not in this document at all' } }], basis_of_award: 'UNKNOWN' }
}
const searchFilters = (task: string) => ({ keywords: /pump/i.test(task) ? 'pump' : '', departments: /dod|defense/i.test(task) ? ['DEPT OF DEFENSE'] : [], naics: [], psc: [], set_asides: [], states: /alabama/i.test(task) ? ['AL'] : [], notice_type_codes: [], color_labels: /active|bid/i.test(task) ? ['GREEN'] : [], source: 'ANY', active_only: /active/i.test(task), posted_within_days: 0, deadline_within_days: 0, value_max: /500,?000/.test(task) ? 500000 : 0, value_min: 0, unmapped: /realistically source/i.test(task) ? ['things we could realistically source'] : [], suggestions: /realistically source/i.test(task) ? ['Filter by the NAICS codes you hold'] : [] })

export function startFakeAnthropic() {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    if (!req.url?.startsWith('/v1/messages')) { res.writeHead(404); return res.end() }
    requests.push(body)
    const content = (body.messages?.[0]?.content ?? []) as Array<{ text?: string }>
    const all = content.map((c) => c.text ?? '').join('\n')
    const system = (body.system ?? []).map((s: { text: string }) => s.text).join('\n')
    const docs = parseDocs(all)
    const task = content[content.length - 1]?.text ?? ''
    const out = /translate a federal-contracting search request/.test(system) ? searchFilters(task) : /Extract the structured facts/.test(task) ? extraction(docs) : brief(task, docs)
    const text = JSON.stringify(out)
    const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(ev('message_start', { type: 'message_start', message: { id: 'msg_qa', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: Math.ceil(all.length / 4), output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }))
    res.write(ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }))
    for (let i = 0; i < text.length; i += 800) res.write(ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 800) } }))
    res.write(ev('content_block_stop', { type: 'content_block_stop', index: 0 }))
    res.write(ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(text.length / 4) } }))
    res.write(ev('message_stop', { type: 'message_stop' }))
    res.end()
  })
  return new Promise<{ close: () => void; url: string }>((ok) => server.listen(PORT, '127.0.0.1', () => ok({ close: () => server.close(), url: `http://127.0.0.1:${PORT}` })))
}
if (process.argv[1]?.endsWith('fake-anthropic.ts')) startFakeAnthropic().then((s) => console.log('fake anthropic on', s.url))

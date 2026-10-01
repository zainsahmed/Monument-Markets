/**
 * QA-ONLY fake of the SAM.gov Get Opportunities API, shaped after the official docs (response fields, `limit`/`offset`,
 * `ncode`, description-as-URL, resourceLinks). It exists so the real sync, quota accounting, normalisation, description
 * fetch and attachment download code can run end to end without a SAM key. It proves our handling of the documented
 * shape — it does NOT prove the live API behaves identically.
 */
import { createServer } from 'node:http'
import { makePdf } from '../fixtures/pdf'

const PORT = Number(process.env.QA_SAM_PORT ?? 54402)
export const calls: string[] = []
const BASE = `http://127.0.0.1:${PORT}`
const iso = (n: number) => { const d = new Date(Date.now() + n * 864e5); d.setUTCHours(18, 0, 0, 0); return d.toISOString().replace('.000Z', '-04:00').replace('Z', '-04:00') }
const post = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)

const BY_NAICS: Record<string, Array<Record<string, unknown>>> = {
  '336413': [1, 2, 3].map((i) => ({ noticeId: `fake-336413-${i}`, title: ['Servo valve assembly, P/N 77-1200', 'Rotor hub bearing replacement kit', 'Avionics cooling fan, 28VDC'][i - 1], solicitationNumber: `W58RGZ-26-Q-20${i}`, fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE ARMY.W58P ACC-REDSTONE', postedDate: post(0), type: i === 3 ? 'Combined Synopsis/Solicitation' : 'Solicitation', archiveDate: post(-60), typeOfSetAside: 'SBA', typeOfSetAsideDescription: 'Total Small Business Set-Aside (FAR 19.5)', responseDeadLine: iso(9 + i), naicsCode: '336413', classificationCode: '1650', active: 'Yes', pointOfContact: [{ type: 'primary', fullName: 'Sam Buyer', email: 'sam.buyer@army.example.mil' }], description: `${BASE}/prod/opportunities/v1/noticedesc?noticeid=fake-336413-${i}`, placeOfPerformance: { city: { name: 'Redstone Arsenal' }, state: { code: 'AL' }, zip: '35898', country: { code: 'USA' } }, uiLink: `https://sam.gov/opp/fake-336413-${i}/view`, resourceLinks: i === 1 ? [`${BASE}/files/fake-336413-1/download`] : [] })),
  '332710': [{ noticeId: 'fake-332710-1', title: 'Machined titanium fitting, 6AL-4V', solicitationNumber: 'N00019-26-Q-5001', fullParentPathName: 'DEPT OF DEFENSE.DEPT OF THE NAVY.NAVAIR', postedDate: post(0), type: 'Sources Sought', archiveDate: post(-45), responseDeadLine: iso(14), naicsCode: '332710', classificationCode: '1560', active: 'Yes', description: `${BASE}/prod/opportunities/v1/noticedesc?noticeid=fake-332710-1`, uiLink: 'https://sam.gov/opp/fake-332710-1/view', resourceLinks: [] }],
  '541330': [],
}
const RFQ = makePdf(['SECTION B - SUPPLIES\nCLIN 0001 Servo valve assembly P/N 77-1200 quantity 12 EA\nFirm fixed price per unit.', 'SECTION F - DELIVERIES\nDelivery within 120 days after receipt of order FOB Destination.\nFirst article testing is required.'])

export function startFakeSam(opts: { quotaAfter?: number } = {}) {
  let n = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url!, BASE)
    calls.push(url.pathname + url.search.replace(/api_key=[^&]*&?/, ''))
    if (!url.searchParams.get('api_key')) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'API_KEY_MISSING' } })) }
    n++
    if (opts.quotaAfter && n > opts.quotaAfter) { res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: 'Message throttled out', description: 'You have exceeded your quota. You can access the API again after: 2099-Jan-01 00:00:00+0000 UTC' })) }
    if (url.pathname === '/search') {
      const nc = url.searchParams.get('ncode')
      const all = nc ? BY_NAICS[nc] ?? [] : Object.values(BY_NAICS).flat()
      const limit = Number(url.searchParams.get('limit') ?? 1), offset = Number(url.searchParams.get('offset') ?? 0)
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ totalRecords: all.length, limit, offset, links: [], opportunitiesData: all.slice(offset * limit, offset * limit + limit) }))
    }
    if (url.pathname === '/prod/opportunities/v1/noticedesc') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ description: `<p>Fake description for ${url.searchParams.get('noticeid')}. Offers shall include a first article test plan.</p>` })) }
    if (url.pathname.endsWith('/download')) { res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Solicitation_W58RGZ-26-Q-201.pdf"' }); return res.end(Buffer.from(RFQ)) }
    res.writeHead(404); res.end()
  })
  return new Promise<{ close: () => void }>((ok) => server.listen(PORT, '127.0.0.1', () => ok({ close: () => server.close() })))
}
if (process.argv[1]?.endsWith('fake-sam.ts')) startFakeSam().then(() => console.log('fake SAM on', BASE))

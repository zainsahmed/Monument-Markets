/** QA-ONLY: screenshots every screen in light & dark at desktop / tablet / mobile against the local QA stack. */
import { chromium, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://127.0.0.1:3100'
const OUT = process.env.SHOTS ?? '/tmp/shots'
const sizes = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1100 }, mobile: { width: 390, height: 844 } } as const

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/sign-in`)
  await page.fill('#email', email); await page.fill('#password', 'qa-password-123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
}
async function oppId(page: Page, title: string): Promise<string> {
  const r = await page.evaluate(async (t) => { const j = await (await fetch(`/api/opportunities?q=${encodeURIComponent(t)}&limit=3`)).json(); return j.rows?.[0]?.id }, title)
  return r
}
async function main() {
  mkdirSync(OUT, { recursive: true })
  const only = process.argv[2]?.split(',')
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  for (const scheme of ['light', 'dark'] as const) for (const [sizeName, vp] of Object.entries(sizes)) {
    if (only && !only.includes(`${scheme}-${sizeName}`)) continue
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: sizeName === 'mobile' })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.log(`[${scheme}-${sizeName}] pageerror:`, e.message.slice(0, 160)))
    await page.goto(`${BASE}/sign-in`); await page.screenshot({ path: `${OUT}/${scheme}-${sizeName}-signin.png` })
    await login(page, 'member@qa.test')
    const id = await oppId(page, 'Hydraulic pump assembly')
    const sv = (await oppId(page, 'Servo valve assembly')) ?? id
    const pages: Array<[string, string]> = [
      ['dashboard', '/dashboard'], ['opps-table', '/opportunities?tab=bid_ready'], ['opps-all', '/opportunities?tab=all'], ['opp-overview', `/opportunities/${id}`],
      ['opp-requirements', `/opportunities/${sv}?tab=requirements`], ['opp-documents', `/opportunities/${sv}?tab=documents`], ['opp-ai', `/opportunities/${sv}?tab=ai`],
      ['opp-historical', `/opportunities/${id}?tab=historical`], ['opp-suppliers', `/opportunities/${sv}?tab=suppliers`], ['opp-pricing', `/opportunities/${sv}?tab=pricing`],
      ['opp-checklist', `/opportunities/${sv}?tab=checklist`], ['opp-notes', `/opportunities/${sv}?tab=notes`], ['opp-activity', `/opportunities/${id}?tab=activity`],
      ['pipeline', '/pipeline'], ['suppliers', '/suppliers'], ['alerts', '/alerts'], ['alert-prefs', '/alerts/preferences'], ['searches', '/searches'], ['company', '/company'], ['settings', '/settings'], ['import', '/import'],
    ]
    for (const [name, url] of pages) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' }).catch(() => undefined)
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${scheme}-${sizeName}-${name}.png`, fullPage: false })
    }
    await ctx.close()
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })

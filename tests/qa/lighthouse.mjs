/* QA-ONLY (plain .mjs: tsx's name-injection breaks Lighthouse's in-browser eval): Lighthouse (performance + accessibility + best practices) on authenticated pages of the local QA app. */
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = 'http://127.0.0.1:3100'
async function main() {
  // sign in with Playwright to get the session cookies, then hand them to Lighthouse
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const ctx = await b.newContext(); const page = await ctx.newPage()
  await page.goto(`${BASE}/sign-in`); await page.fill('#email', 'member@qa.test'); await page.fill('#password', 'qa-password-123'); await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')
  const id = await page.evaluate(async () => (await (await fetch('/api/opportunities?q=Hydraulic&limit=1')).json()).rows[0].id)
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ')
  await b.close()
  const chrome = await launch({ chromePath: exe, chromeFlags: ['--headless=new', '--no-sandbox'] })
  const pages = [['sign-in (anon)', '/sign-in'], ['dashboard', '/dashboard'], ['opportunities', '/opportunities?tab=bid_ready'], ['opportunity detail', `/opportunities/${id}`], ['ai analysis', `/opportunities/${id}?tab=ai`], ['pipeline', '/pipeline'], ['settings', '/settings']]
  for (const [name, url] of pages) {
    const res = await lighthouse(`${BASE}${url}`, { port: chrome.port, output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices'], extraHeaders: name.includes('anon') ? {} : { Cookie: cookie }, formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false }, throttlingMethod: 'simulate', throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } })
    const c = res.lhr.categories
    const fails = Object.values(res.lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && c.accessibility.auditRefs.some((r) => r.id === a.id)).map((a) => a.id)
    console.log(name.padEnd(20), 'perf', Math.round((c.performance.score ?? 0) * 100), 'a11y', Math.round((c.accessibility.score ?? 0) * 100), 'best', Math.round((c['best-practices'].score ?? 0) * 100), fails.length ? `a11y issues: ${fails.join(',')}` : '')
  }
  await chrome.kill()
}
main().catch((e) => { console.error(e); process.exit(1) })

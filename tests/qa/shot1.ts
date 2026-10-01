import { chromium } from '@playwright/test'
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
async function main() {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text().slice(0, 200)))
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)))
  await page.goto('http://127.0.0.1:3100/sign-in')
  await page.screenshot({ path: '/tmp/shots/signin.png' })
  await page.fill('#email', 'member@qa.test'); await page.fill('#password', 'qa-password-123')
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: '/tmp/shots/dashboard.png', fullPage: true })
  console.log('ok', page.url())
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })

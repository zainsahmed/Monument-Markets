import { chromium } from '@playwright/test'
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
async function main() {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const page = await (await browser.newContext()).newPage()
  await page.goto('http://127.0.0.1:3100/sign-in')
  await page.fill('#email', 'member@qa.test'); await page.fill('#password', 'qa-password-123'); await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard')
  const r = await page.evaluate(async () => { const x = await fetch('/api/opportunities?q=Hydraulic%20pump&limit=3'); return { status: x.status, body: (await x.text()).slice(0, 400) } })
  console.log(r)
  await browser.close()
}
main()

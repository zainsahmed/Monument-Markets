import { chromium } from '@playwright/test'
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
async function main() {
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 300)))
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)))
  await page.goto('http://127.0.0.1:3100/sign-in')
  await page.fill('#email', 'owner@qa.test'); await page.fill('#password', 'qa-password-123'); await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard')
  await page.goto('http://127.0.0.1:3100/company')
  await page.getByRole('button', { name: 'Contract size & margin' }).click()
  await page.getByLabel('Minimum gross margin (%)').fill('18')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.waitForTimeout(2500)
  console.log(await page.locator('[role=status]').allTextContents())
  await browser.close()
}
main()

import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string) {
  await page.goto('/sign-in')
  await page.fill('#email', email); await page.fill('#password', 'qa-password-123')
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard')
}

test.describe('roles and safety rails', () => {
  test('viewers are read-only and never see supplier or pricing data', async ({ page, request }) => {
    await login(page, 'viewer@qa.test')
    await page.goto('/opportunities?tab=all')
    await expect(page.getByRole('checkbox', { name: /Select all/ })).toHaveCount(0) // no bulk selection
    await page.getByRole('link', { name: /Hydraulic pump assembly/ }).first().click()
    await expect(page.getByText('Internal workflow status')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Suppliers' }).click()
    await expect(page.getByText('Supplier data isn’t available to viewers')).toBeVisible()
    await page.getByRole('tab', { name: 'Pricing' }).click()
    await expect(page.getByText('Pricing isn’t available to viewers')).toBeVisible()
    await page.goto('/suppliers')
    await expect(page.getByText('Supplier data isn’t available to viewers')).toBeVisible()
    // API: viewers cannot spend AI budget or import
    const id = await page.evaluate(async () => (await (await fetch('/api/opportunities?q=Hydraulic&limit=1')).json()).rows[0].id)
    const analyze = await page.evaluate(async (i) => (await fetch(`/api/opportunities/${i}/analyze`, { method: 'POST' })).status, id)
    expect(analyze).toBe(403)
    const imp = await page.evaluate(async () => (await fetch('/api/import/dibbs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'NSN: 5310-00-123-4567 and more text here' }) })).status)
    expect(imp).toBe(403)
    void request
  })

  test('members can work but cannot edit the company profile or manage the team', async ({ page }) => {
    await login(page, 'member@qa.test')
    await page.goto('/company')
    await expect(page.getByText('Only owners can edit the company profile.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByLabel('Add by email')).toHaveCount(0)
  })

  test('DIBBS import parses an RFQ, shows Unknown for missing fields, and the opportunity flows through detail', async ({ page }) => {
    await login(page, 'member@qa.test')
    await page.goto('/import')
    await page.getByLabel('RFQ text').fill('RFQ NO: SPE7M1-26-T-0777\nISSUE DATE: 09-24-2026\nRETURN BY: 11-15-2026\nNSN/PART: 4320-01-234-5678\nNOMENCLATURE: PUMP,ROTARY\nQTY: 25  UI: EA\nDELIVERY: 60 DAYS ARO\nFOB: Destination')
    await page.getByRole('button', { name: 'Import pasted text' }).click()
    await expect(page.getByText('Imported SPE7M1-26-T-0777')).toBeVisible()
    await expect(page.locator('dd', { hasText: '4320-01-234-5678' })).toBeVisible()
    await expect(page.getByText('Unknown').first()).toBeVisible() // packaging / approved sources were not in the text
    await page.getByRole('link', { name: 'Open opportunity' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('PUMP,ROTARY — NSN 4320-01-234-5678')
    await expect(page.getByText('DIBBS RFQ (imported)')).toBeVisible()
    await expect(page.getByText('Potential bid').first()).toBeVisible() // dibbs_rfq with a future deadline
    await page.getByRole('tab', { name: 'Checklist' }).click()
    await page.getByRole('button', { name: 'Start checklist' }).click()
    await expect(page.getByText(/\d+ items? unknown/).first()).toBeVisible()
    // garbage is rejected, not guessed at
    await page.goto('/import')
    await page.getByLabel('RFQ text').fill('This is just some random paragraph of text that is not an RFQ at all.')
    await page.getByRole('button', { name: 'Import pasted text' }).click()
    await expect(page.getByText(/Could not find an RFQ number or NSN/)).toBeVisible()
  })

  test('award notices are red and clearly not bid opportunities', async ({ page }) => {
    await login(page, 'member@qa.test')
    await page.goto('/opportunities?tab=awarded')
    await page.getByRole('link', { name: /Award: Fabrication of ground support equipment/ }).first().click()
    await expect(page.getByText('This is an Award Notice, not a bid opportunity.')).toBeVisible()
    await expect(page.getByText('Awarded', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Why this label?' }).click()
    await expect(page.getByText(/Award Notice — an award has been made; this is not a bid opportunity\./)).toBeVisible()
  })

  test('command palette, keyboard navigation and shortcuts help', async ({ page }) => {
    await login(page, 'member@qa.test')
    await page.goto('/opportunities?tab=bid_ready')
    await expect(page.getByRole('grid')).toBeVisible()
    await page.keyboard.press('j'); await page.keyboard.press('j')
    await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-idx', '2')
    await page.keyboard.press('k')
    await expect(page.locator('tr[aria-selected="true"]')).toHaveAttribute('data-idx', '1')
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder(/Search opportunities/).fill('torque')
    await expect(page.getByRole('option', { name: /Calibration services for torque wrenches/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}/)
    await page.keyboard.press('Control+/')
    await expect(page.getByText('Command palette').first()).toBeVisible()
  })

  test('sync stops gracefully when SAM reports quota exhaustion and the dashboard says so', async ({ page, request }) => {
    // reuse the cron route with the fake SAM already used by the sync test; exhaust today's budget first
    const h = { authorization: 'Bearer qa-cron-secret-0123456789abcdef0123' }
    for (let i = 0; i < 4; i++) await request.post('/api/cron/sync-sam', { headers: h })
    const last = await (await request.post('/api/cron/sync-sam', { headers: h })).json()
    expect(last.status).toBe('quota_exhausted')
    expect(last.callsUsed).toBe(0) // nothing spent: only the reserved on-demand calls remain
    await login(page, 'member@qa.test')
    await expect(page.getByText(/Today’s SAM.gov call budget is used up/)).toBeVisible()
    await expect(page.getByText(/everything below uses stored data|Everything below uses stored data/)).toBeVisible()
    await expect(page.getByRole('link', { name: /Bid-ready/ })).toBeVisible() // app stays usable
  })
})

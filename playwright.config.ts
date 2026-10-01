import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests run the real Next app against the local QA stack (real Postgres + real migrations/RLS behind a
 * Supabase-compatible shim, fake SAM and fake Anthropic endpoints). `scripts/qa.sh up` is invoked by global setup.
 * To run against a real Supabase project instead, set E2E_BASE_URL and skip the local stack with E2E_EXTERNAL=1.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] },
  },
})

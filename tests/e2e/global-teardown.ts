import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default async function globalTeardown() {
  if (process.env.E2E_EXTERNAL === '1' || process.env.E2E_KEEP === '1') return
  execFileSync(path.resolve(__dirname, '../../scripts/qa.sh'), ['down'], { stdio: 'inherit' })
}

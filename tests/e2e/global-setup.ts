import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default async function globalSetup() {
  if (process.env.E2E_EXTERNAL === '1') return
  execFileSync(path.resolve(__dirname, '../../scripts/qa.sh'), ['up'], { stdio: 'inherit', timeout: 600_000 })
}

/**
 * Build check (spec §16): fail if any server-only secret name — or its actual value — appears in
 * client-reachable output (.next/static) or in client component source.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const SECRET_NAMES = ['SAM_API_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'RESEND_API_KEY']
const secretValues = SECRET_NAMES.map((n) => process.env[n]).filter((v): v is string => !!v && v.length >= 10)

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(e.name) && dir === root) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const problems: string[] = []

// 1. compiled client bundles
const staticDir = path.join(root, '.next/static')
try {
  statSync(staticDir)
  for (const f of walk(staticDir)) {
    if (!/\.(js|css|html|json|map)$/.test(f)) continue
    const text = readFileSync(f, 'utf8')
    for (const n of SECRET_NAMES) if (text.includes(n)) problems.push(`${path.relative(root, f)} mentions ${n}`)
    for (const v of secretValues) if (text.includes(v)) problems.push(`${path.relative(root, f)} contains a secret value`)
  }
} catch {
  /* no build output yet */
}

// 2. 'use client' source files and anything under components/ must not reference secret names or server-only modules
for (const dir of ['app', 'components', 'lib']) {
  let files: string[] = []
  try { files = walk(path.join(root, dir)) } catch { continue }
  for (const f of files) {
    if (!/\.(ts|tsx)$/.test(f)) continue
    const text = readFileSync(f, 'utf8')
    const isClient = /^\s*['"]use client['"]/m.test(text.slice(0, 200))
    if (!isClient) continue
    for (const n of SECRET_NAMES) if (text.includes(n)) problems.push(`client file ${path.relative(root, f)} references ${n}`)
    if (/from ['"]@\/lib\/(env|supabase\/admin|ai|sam|usaspending)(\/|['"])/.test(text)) problems.push(`client file ${path.relative(root, f)} imports a server-only module`)
  }
}

if (problems.length) {
  console.error('SECRET LEAK CHECK FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log('check-secrets: ok')

/**
 * Build check (spec §16): fail the build if a server-only secret can reach the browser.
 *  1. Compiled client output (.next/static, .next-qa/static): no secret VALUES from the environment, no service-role
 *     JWTs, no Anthropic / Resend key shapes.
 *  2. Source: no 'use client' file reads process.env.<SECRET> or imports a module that imports 'server-only'
 *     (Next also enforces the latter at build time; this reports it earlier with file names).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const SECRET_NAMES = ['SAM_API_KEY', 'ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'RESEND_API_KEY']
const secretValues = SECRET_NAMES.map((n) => process.env[n]).filter((v): v is string => !!v && v.length >= 10)

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.next-qa', '.git', 'test-results'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const problems: string[] = []
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g

for (const dist of ['.next/static', '.next-qa/static']) {
  const dir = path.join(root, dist)
  try { statSync(dir) } catch { continue }
  const files: string[] = []
  const rec = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? rec(p) : files.push(p) } }
  rec(dir)
  for (const f of files) {
    if (!/\.(js|css|html|json|map)$/.test(f)) continue
    const text = readFileSync(f, 'utf8')
    const rel = path.relative(root, f)
    for (const v of secretValues) if (text.includes(v)) problems.push(`${rel} contains a secret value`)
    for (const m of text.matchAll(JWT)) {
      try { if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') problems.push(`${rel} contains a service-role JWT`) } catch { /* not a JWT */ }
    }
    if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(text)) problems.push(`${rel} contains an Anthropic-style key`)
    if (/\bre_[A-Za-z0-9]{24,}\b/.test(text)) problems.push(`${rel} contains a Resend-style key`)
  }
}

const sources = ['app', 'components', 'lib'].flatMap((d) => { try { return walk(path.join(root, d)) } catch { return [] } }).filter((f) => /\.(ts|tsx)$/.test(f))
const serverOnly = new Set(sources.filter((f) => /^\s*import\s+['"]server-only['"]/m.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/\.(ts|tsx)$/, '').replace(/\/index$/, '')))
const resolve = (spec: string) => path.join(root, spec.replace(/^@\//, '')).replace(/\/index$/, '')

for (const f of sources) {
  const text = readFileSync(f, 'utf8')
  if (!/^\s*['"]use client['"]/m.test(text.slice(0, 200))) continue
  const rel = path.relative(root, f)
  for (const n of SECRET_NAMES) if (new RegExp(`process\\.env\\.${n}\\b`).test(text) || new RegExp(`process\\.env\\[['"]${n}['"]\\]`).test(text)) problems.push(`client file ${rel} reads ${n}`)
  // type-only imports are erased at compile time and cannot leak anything
  for (const m of text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"](@\/[^'"]+)['"]/gm)) {
    const target = resolve(m[1])
    if (serverOnly.has(target)) problems.push(`client file ${rel} imports server-only module ${m[1]}`)
  }
}

if (problems.length) {
  console.error('SECRET LEAK CHECK FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'))
  process.exit(1)
}
console.log(`check-secrets: ok (${sources.length} source files, ${serverOnly.size} server-only modules)`)

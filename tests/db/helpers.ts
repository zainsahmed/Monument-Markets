import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const root = path.resolve(__dirname, '../..')
export const BASE_URL = process.env.FP_TEST_DB_ADMIN_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres'

/** Creates a fresh database with the Supabase shim + all migrations applied. */
export async function createTestDb(name: string): Promise<{ admin: Client; url: string; drop: () => Promise<void> }> {
  const base = new Client({ connectionString: BASE_URL })
  await base.connect()
  await base.query(`drop database if exists ${name} with (force)`)
  await base.query(`create database ${name}`)
  const url = BASE_URL.replace(/\/[^/]*$/, `/${name}`)
  const admin = new Client({ connectionString: url })
  await admin.connect()
  const files = ['supabase/tests/shim.sql', ...readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`)]
  for (const f of files) await admin.query(readFileSync(path.join(root, f), 'utf8'))
  return {
    admin,
    url,
    drop: async () => {
      await admin.end()
      await base.query(`drop database if exists ${name} with (force)`)
      await base.end()
    },
  }
}

/** Run SQL as an authenticated user (RLS applies) in a rolled-back-on-error transaction. */
export async function asUser<T>(admin: Client, userId: string | null, fn: (q: (sql: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>) => Promise<T>): Promise<T> {
  await admin.query('begin')
  try {
    await admin.query(`set local role ${userId ? 'authenticated' : 'service_role'}`)
    await admin.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    const out = await fn((sql, p) => admin.query(sql, p))
    await admin.query('commit')
    return out
  } catch (e) {
    await admin.query('rollback')
    throw e
  }
}

export function dbAvailable(): boolean {
  try {
    execFileSync('pg_isready', ['-h', '127.0.0.1', '-p', '54329'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

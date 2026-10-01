import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { Client } from 'pg'
import { createTestDb } from '../db/helpers'
import { startFakeAnthropic } from './fake-anthropic'
import { startFakeSam } from './fake-sam'
import { startShim } from './shim/server'
import { seed } from './seed'

/** Boots the whole local QA stack: Postgres (real migrations) + Supabase-compatible shim + fake Anthropic + fixtures. */
export async function startStack() {
  execFileSync(path.resolve(__dirname, '../../scripts/test-db.sh'), ['start'], { stdio: 'ignore' })
  process.env.QA_DB_URL = process.env.QA_DB_URL ?? 'postgres://postgres@127.0.0.1:54329/fp_qa'
  const db = await createTestDb('fp_qa')
  await (db.admin as Client).query('create table if not exists auth.qa_credentials (user_id uuid primary key references auth.users(id) on delete cascade, pw text not null)')
  const shim = await startShim()
  const llm = await startFakeAnthropic()
  const sam = await startFakeSam()
  const seeded = await seed(shim.pool, shim.url)
  return { shim, llm, db, seeded, close: async () => { llm.close(); sam.close(); await shim.close(); await db.admin.end() } }
}
if (process.argv[1]?.endsWith('stack.ts')) startStack().then((s) => console.log('QA stack up', s.shim.url, Object.keys(s.seeded.users)))

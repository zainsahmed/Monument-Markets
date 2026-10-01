import { createClient } from '@supabase/supabase-js'
import { ANON_KEY } from './shim/server'
const sb = createClient('http://127.0.0.1:54400', ANON_KEY, { auth: { persistSession: false } })
async function main() {
  await sb.auth.signInWithPassword({ email: 'member@qa.test', password: 'qa-password-123' })
  const r = await sb.rpc('search_opportunity_ids', { q: 'Hydraulic pump', lim: 5000 })
  console.log(r.error?.message, r.data)
  const ids = (r.data ?? []).map((x: { opportunity_id: string }) => x.opportunity_id)
  const q = await sb.from('opportunities').select('id, title', { count: 'estimated' }).in('id', ids).order('response_deadline', { ascending: true, nullsFirst: false }).order('id').range(0, 4)
  console.log(q.error?.message, q.data, q.count)
}
main()

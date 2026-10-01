/**
 * QA-ONLY local stand-in for the Supabase HTTP surface Fieldpoint uses: GoTrue auth subset, PostgREST subset
 * (see postgrest.ts), and Storage. Backed by real Postgres with the real migrations, so RLS is the real RLS.
 *   QA_DB_URL=postgres://postgres@127.0.0.1:54329/fp_qa  npx tsx tests/qa/shim/server.ts
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { Pool, types } from 'pg'

// PostgREST returns DATE columns as 'YYYY-MM-DD' strings (node-pg would parse them into JS Dates).
types.setTypeParser(1082, (v) => v)
// …and NUMERIC / BIGINT as JSON numbers (node-pg returns strings).
types.setTypeParser(1700, (v) => parseFloat(v))
types.setTypeParser(20, (v) => parseInt(v, 10))
import { Rest, RestError } from './postgrest'

const PORT = Number(process.env.QA_SHIM_PORT ?? 54400)
const SECRET = process.env.QA_JWT_SECRET ?? 'qa-jwt-secret-0123456789abcdef0123456789'
const DB = process.env.QA_DB_URL ?? 'postgres://postgres@127.0.0.1:54329/fp_qa'
const STORE = path.resolve(process.env.QA_STORAGE_DIR ?? path.join(__dirname, '../.data/storage'))

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
export function sign(payload: Record<string, unknown>, ttl = 3600): string {
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64(JSON.stringify({ iss: 'qa-shim', aud: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl, ...payload }))
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
export function verify(tok: string): Record<string, any> | null {
  const [h, p, s] = tok.split('.')
  if (!h || !p || !s) return null
  const exp = createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')
  if (exp.length !== s.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(s))) return null
  const pl = JSON.parse(Buffer.from(p, 'base64url').toString())
  return pl.exp && pl.exp < Date.now() / 1000 ? null : pl
}
// Fixed iat/exp so the keys are identical on every run (the Next build bakes the anon key into the client bundle).
export const ANON_KEY = sign({ role: 'anon', iss: 'supabase', iat: 1700000000, exp: 4102444800 })
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'supabase', iat: 1700000000, exp: 4102444800 })

const pool = new Pool({ connectionString: DB, max: 8 })
const rest = new Rest(pool)

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  const data = body === null || body === undefined || status === 204 ? '' : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers })
  res.end(data)
}
const readBody = (req: IncomingMessage): Promise<Buffer> => new Promise((ok) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))) })

function hash(pw: string, salt = randomBytes(8).toString('hex')) { return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}` }
const checkPw = (pw: string, stored: string) => { const [salt] = stored.split(':'); return hash(pw, salt) === stored }

async function userJson(id: string) {
  const r = await pool.query('select id, email, created_at from auth.users where id = $1', [id])
  if (!r.rows[0]) return null
  return { id, aud: 'authenticated', role: 'authenticated', email: r.rows[0].email, email_confirmed_at: r.rows[0].created_at, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: r.rows[0].created_at, updated_at: r.rows[0].created_at }
}
async function session(id: string) {
  const user = await userJson(id)
  const access = sign({ sub: id, role: 'authenticated', email: user?.email, session_id: randomUUID(), app_metadata: { provider: 'email' }, user_metadata: {} })
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: sign({ sub: id, typ: 'refresh' }, 30 * 864e2), user }
}

async function auth(req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer) {
  const p = url.pathname.replace('/auth/v1', '')
  const json = body.length ? JSON.parse(body.toString()) : {}
  if (p === '/token') {
    const grant = url.searchParams.get('grant_type')
    if (grant === 'password') {
      const u = await pool.query('select u.id, c.pw from auth.users u join auth.qa_credentials c on c.user_id = u.id where lower(u.email) = lower($1)', [json.email])
      if (!u.rows[0] || !checkPw(json.password ?? '', u.rows[0].pw)) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return send(res, 200, await session(u.rows[0].id))
    }
    if (grant === 'refresh_token') { const v = verify(json.refresh_token ?? ''); return v?.sub ? send(res, 200, await session(v.sub)) : send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }) }
  }
  if (p === '/signup') {
    const ex = await pool.query('select 1 from auth.users where lower(email)=lower($1)', [json.email])
    if (ex.rowCount) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
    const id = randomUUID()
    await pool.query('insert into auth.users (id, email) values ($1,$2)', [id, json.email])
    await pool.query('insert into auth.qa_credentials (user_id, pw) values ($1,$2)', [id, hash(json.password ?? randomUUID())])
    return send(res, 200, await session(id))
  }
  if (p === '/user') {
    const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    const v = verify(tok)
    if (!v?.sub) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' })
    const u = await userJson(v.sub)
    return u ? send(res, 200, u) : send(res, 404, { code: 404, msg: 'User not found' })
  }
  if (p === '/logout') return send(res, 204, null)
  if (p === '/.well-known/jwks.json') return send(res, 200, { keys: [] })
  if (p.startsWith('/admin/users')) {
    const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (verify(tok)?.role !== 'service_role') return send(res, 403, { msg: 'not admin' })
    const id = p.split('/')[3]
    if (id) { const u = await userJson(id); return u ? send(res, 200, u) : send(res, 404, { msg: 'not found' }) }
    const all = await pool.query('select id from auth.users order by created_at')
    return send(res, 200, { users: await Promise.all(all.rows.map((r) => userJson(r.id))), aud: 'authenticated' })
  }
  return send(res, 404, { msg: `unsupported auth route ${p}` })
}

async function restRoute(req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer) {
  const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '') || String(req.headers.apikey ?? '')
  const claims = verify(tok)
  if (!claims) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid', details: null, hint: null })
  const role = claims.role === 'service_role' ? 'service_role' : claims.role === 'authenticated' && claims.sub ? 'authenticated' : 'anon'
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query(`set local role ${role}`)
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [claims.sub ?? '', JSON.stringify(claims)])
    const name = url.pathname.replace('/rest/v1/', '')
    const prefer = String(req.headers.prefer ?? ''); const accept = String(req.headers.accept ?? '')
    const parsed = body.length ? JSON.parse(body.toString()) : null
    let out: { status: number; body: unknown; range?: string }
    if (name.startsWith('rpc/')) out = { status: 200, body: await rest.rpc(db, name.slice(4), parsed ?? {}) }
    else out = await rest.handle(db, req.method!, name, url.searchParams, parsed, prefer, accept)
    await db.query('commit')
    send(res, out.status, out.body, out.range ? { 'content-range': out.range } : {})
  } catch (e) {
    await db.query('rollback').catch(() => undefined)
    const err = e as { code?: string; message: string; status?: number; detail?: string }
    if (e instanceof RestError) return send(res, e.status, { code: e.code, message: e.message, details: null, hint: null })
    const status = err.code === '42501' ? (role === 'anon' ? 401 : 403) : err.code === '23505' || err.code === '23503' ? 409 : err.code?.startsWith('42') ? 400 : 400
    send(res, status, { code: err.code ?? 'PGRST000', message: err.message, details: err.detail ?? null, hint: null })
  } finally { db.release() }
}

async function storage(req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer) {
  const p = url.pathname.replace('/storage/v1', '')
  const file = (bucket: string, rel: string) => path.join(STORE, bucket, rel)
  const sign_m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/)
  if (sign_m && req.method === 'POST') {
    if (verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))?.role !== 'service_role') return send(res, 403, { message: 'not allowed' })
    const token = sign({ bucket: sign_m[1], key: decodeURIComponent(sign_m[2]) }, Number(JSON.parse(body.toString() || '{}').expiresIn ?? 300))
    return send(res, 200, { signedURL: `/object/sign/${sign_m[1]}/${sign_m[2]}?token=${token}` })
  }
  if (sign_m && req.method === 'GET') {
    const v = verify(url.searchParams.get('token') ?? '')
    if (!v || v.bucket !== sign_m[1] || v.key !== decodeURIComponent(sign_m[2])) return send(res, 400, { message: 'invalid or expired token' })
    const f = file(sign_m[1], decodeURIComponent(sign_m[2]))
    if (!existsSync(f)) return send(res, 404, { message: 'not found' })
    const ext = f.split('.').pop()
    res.writeHead(200, { 'content-type': ext === 'pdf' ? 'application/pdf' : 'application/octet-stream', 'access-control-allow-origin': '*', ...(url.searchParams.get('download') ? { 'content-disposition': `attachment; filename="${path.basename(f)}"` } : {}) })
    return res.end(readFileSync(f))
  }
  const up = p.match(/^\/object\/([^/]+)\/(.+)$/)
  if (up && (req.method === 'POST' || req.method === 'PUT')) {
    if (verify((req.headers.authorization ?? '').replace(/^Bearer /, ''))?.role !== 'service_role') return send(res, 403, { message: 'not allowed' })
    const ct = String(req.headers['content-type'] ?? '')
    let bytes: Buffer = body
    if (ct.startsWith('multipart/form-data')) {
      const form = await new Response(new Uint8Array(body), { headers: { 'content-type': ct } }).formData()
      const f = form.get('') ?? form.get('file')
      bytes = Buffer.from(await (f as Blob).arrayBuffer())
    }
    const f = file(up[1], decodeURIComponent(up[2]))
    mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, bytes)
    return send(res, 200, { Key: `${up[1]}/${up[2]}`, Id: randomUUID() })
  }
  return send(res, 404, { message: `unsupported storage route ${p}` })
}

export async function startShim() {
  await pool.query('create table if not exists auth.qa_credentials (user_id uuid primary key references auth.users(id) on delete cascade, pw text not null)')
  await rest.init()
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end() }
      const url = new URL(req.url!, `http://${req.headers.host}`)
      const body = await readBody(req)
      if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url, body)
      if (url.pathname.startsWith('/rest/v1')) return await restRoute(req, res, url, body)
      if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url, body)
      send(res, 404, { message: 'not found' })
    } catch (e) { console.error('shim error', e); send(res, 500, { message: String(e) }) }
  })
  await new Promise<void>((ok) => server.listen(PORT, '127.0.0.1', ok))
  return { server, pool, url: `http://127.0.0.1:${PORT}`, close: async () => { server.close(); await pool.end() } }
}
export const hashPassword = hash

if (process.argv[1]?.endsWith('server.ts')) {
  startShim().then((s) => console.log(`QA shim on ${s.url}\nANON=${ANON_KEY}\nSERVICE=${SERVICE_KEY}`))
}

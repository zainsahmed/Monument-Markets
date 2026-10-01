/**
 * QA-ONLY: a small PostgREST-compatible query engine over plain Postgres, used to run the real app and its
 * real schema/RLS locally when Docker / the Supabase stack isn't available. Implements the subset of PostgREST
 * that Fieldpoint uses (select with embeds, filters, order, range, count, insert/upsert/update/delete, rpc).
 * It is NOT shipped and NOT a substitute for testing against Supabase.
 */
import type { Pool, PoolClient } from 'pg'

interface Fk { table: string; cols: string[]; ftable: string; fcols: string[] }
export class Rest {
  private fks: Fk[] = []
  private colTypes = new Map<string, Map<string, string>>()
  private pks = new Map<string, string[]>()
  constructor(private pool: Pool) {}

  async init() {
    const fk = await this.pool.query(`select c.conrelid::regclass::text as t, c.confrelid::regclass::text as ft,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
      (select array_agg(a.attname::text order by k.ord) from unnest(c.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as fcols
      from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`)
    this.fks = fk.rows.map((r) => ({ table: r.t.replace(/^public\./, ''), cols: r.cols, ftable: r.ft.replace(/^public\./, ''), fcols: r.fcols }))
    const cols = await this.pool.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public'`)
    for (const r of cols.rows) { if (!this.colTypes.has(r.table_name)) this.colTypes.set(r.table_name, new Map()); this.colTypes.get(r.table_name)!.set(r.column_name, r.data_type) }
    const pk = await this.pool.query(`select c.conrelid::regclass::text as t, (select array_agg(a.attname::text) from unnest(c.conkey) k(attnum) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum) as cols from pg_constraint c where c.contype='p' and c.connamespace='public'::regnamespace`)
    for (const r of pk.rows) this.pks.set(r.t.replace(/^public\./, ''), r.cols)
  }

  // ------------------------------------------------------------------ select parsing
  private splitTop(s: string): string[] {
    const out: string[] = []; let depth = 0, cur = ''
    for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch }
    if (cur.trim()) out.push(cur)
    return out.map((x) => x.trim()).filter(Boolean)
  }
  parseSelect(sel: string): SelItem[] {
    return this.splitTop(sel || '*').map((raw) => {
      const m = raw.match(/^(?:([\w]+):)?([\w]+)(?:!([\w]+))?\(([\s\S]*)\)$/)
      if (m) return { kind: 'embed' as const, alias: m[1] ?? m[2], rel: m[2], hint: m[3], inner: m[3] === 'inner', items: m[4].trim() === 'count' ? 'count' as const : this.parseSelect(m[4]) }
      const c = raw.match(/^(?:([\w]+):)?([\w*]+)(?:::\w+)?$/)
      if (!c) throw new RestError(400, 'PGRST100', `bad select item: ${raw}`)
      return { kind: 'col' as const, alias: c[1], name: c[2] }
    })
  }

  private rel(table: string, rel: string): { kind: 'm2o' | 'o2m'; fk: Fk } {
    const direct = this.fks.filter((f) => f.table === table && f.ftable === rel)
    if (direct.length) return { kind: 'm2o', fk: direct[0] }
    const rev = this.fks.filter((f) => f.table === rel && f.ftable === table)
    if (rev.length) return { kind: 'o2m', fk: rev[0] }
    throw new RestError(400, 'PGRST200', `Could not find a relationship between '${table}' and '${rel}'`)
  }
  private q = (id: string) => `"${id.replace(/"/g, '""')}"`

  /** Build SELECT list SQL for `table` aliased `a`. */
  private selectList(table: string, a: string, items: SelItem[], embedFilters: Record<string, string[][]>, params: unknown[], ctr: { n: number }): string {
    const parts: string[] = []
    for (const it of items) {
      if (it.kind === 'col') {
        if (it.name === '*') parts.push(`${a}.*`)
        else parts.push(`${a}.${this.q(it.name)}${it.alias ? ` as ${this.q(it.alias)}` : ''}`)
      } else {
        const r = this.rel(table, it.rel)
        const b = `t${++ctr.n}`
        const join = r.kind === 'm2o'
          ? r.fk.cols.map((c, i) => `${b}.${this.q(r.fk.fcols[i])} = ${a}.${this.q(c)}`).join(' and ')
          : r.fk.cols.map((c, i) => `${b}.${this.q(c)} = ${a}.${this.q(r.fk.fcols[i])}`).join(' and ')
        const filt = (embedFilters[it.alias] ?? []).map((f) => this.filterSql(b, f[0], f[1], params)).join(' and ')
        const where = [join, filt].filter(Boolean).join(' and ')
        if (it.items === 'count') parts.push(`json_build_array(json_build_object('count', (select count(*) from ${this.q(it.rel)} ${b} where ${where}))) as ${this.q(it.alias)}`)
        else {
          const inner = this.selectList(it.rel, b, it.items, {}, params, ctr)
          if (r.kind === 'm2o') parts.push(`(select row_to_json(x) from (select ${inner} from ${this.q(it.rel)} ${b} where ${where}) x) as ${this.q(it.alias)}`)
          else parts.push(`coalesce((select json_agg(row_to_json(x)) from (select ${inner} from ${this.q(it.rel)} ${b} where ${where}) x), '[]'::json) as ${this.q(it.alias)}`)
        }
      }
    }
    return parts.join(', ') || `${a}.*`
  }
  private innerExists(table: string, a: string, items: SelItem[], embedFilters: Record<string, string[][]>, params: unknown[], ctr: { n: number }): string[] {
    const conds: string[] = []
    for (const it of items) if (it.kind === 'embed' && it.inner) {
      const r = this.rel(table, it.rel); const b = `t${++ctr.n}`
      const join = r.kind === 'm2o' ? r.fk.cols.map((c, i) => `${b}.${this.q(r.fk.fcols[i])} = ${a}.${this.q(c)}`).join(' and ') : r.fk.cols.map((c, i) => `${b}.${this.q(c)} = ${a}.${this.q(r.fk.fcols[i])}`).join(' and ')
      const filt = (embedFilters[it.alias] ?? []).map((f) => this.filterSql(b, f[0], f[1], params)).join(' and ')
      conds.push(`exists (select 1 from ${this.q(it.rel)} ${b} where ${[join, filt].filter(Boolean).join(' and ')})`)
    }
    return conds
  }

  // ------------------------------------------------------------------ filters
  private val(v: string, params: unknown[]): string { params.push(v); return `$${params.length}` }
  private filterSql(a: string, col: string, expr: string, params: unknown[]): string {
    let neg = false, e = expr
    if (e.startsWith('not.')) { neg = true; e = e.slice(4) }
    const dot = e.indexOf('.'); const op = e.slice(0, dot); const v = e.slice(dot + 1)
    const c = `${a}.${this.q(col)}`
    let sql: string
    switch (op) {
      case 'eq': sql = `${c} = ${this.val(v, params)}`; break
      case 'neq': sql = `${c} <> ${this.val(v, params)}`; break
      case 'gt': sql = `${c} > ${this.val(v, params)}`; break
      case 'gte': sql = `${c} >= ${this.val(v, params)}`; break
      case 'lt': sql = `${c} < ${this.val(v, params)}`; break
      case 'lte': sql = `${c} <= ${this.val(v, params)}`; break
      case 'like': sql = `${c} like ${this.val(v.replace(/\*/g, '%'), params)}`; break
      case 'ilike': sql = `${c} ilike ${this.val(v.replace(/\*/g, '%'), params)}`; break
      case 'is': sql = v === 'null' ? `${c} is null` : v === 'true' ? `${c} is true` : v === 'false' ? `${c} is false` : `${c} is unknown`; break
      case 'in': { const list = this.splitTop(v.replace(/^\(|\)$/g, '')).map((x) => x.replace(/^"|"$/g, '')); sql = list.length ? `${c}::text = any(array[${list.map((x) => this.val(x, params)).join(',')}]::text[])` : 'false'; break }
      default: throw new RestError(400, 'PGRST100', `unsupported operator ${op}`)
    }
    if (op === 'is' && neg) return `${c} is not ${v === 'null' ? 'null' : v}`
    return neg ? `not (${sql})` : sql
  }
  private orSql(a: string, expr: string, params: unknown[]): string {
    const inner = expr.replace(/^\(|\)$/g, '')
    const parts = this.splitTop(inner).map((p) => {
      const m = p.match(/^(and|or)\(([\s\S]*)\)$/)
      if (m) return m[1] === 'and' ? `(${this.splitTop(m[2]).map((x) => this.orPart(a, x, params)).join(' and ')})` : `(${this.orSql(a, `(${m[2]})`, params)})`
      return this.orPart(a, p, params)
    })
    return parts.join(' or ')
  }
  private orPart(a: string, p: string, params: unknown[]) { const i = p.indexOf('.'); return this.filterSql(a, p.slice(0, i), p.slice(i + 1), params) }

  private whereFor(table: string, a: string, sp: URLSearchParams, items: SelItem[], params: unknown[], ctr: { n: number }) {
    const own: string[] = []; const emb: Record<string, string[][]> = {}
    const aliases = new Set(items.filter((i) => i.kind === 'embed').map((i) => (i as EmbedItem).alias))
    for (const [k, v] of sp.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
      if (k === 'or') { own.push(`(${this.orSql(a, v, params)})`); continue }
      if (k === 'and') { own.push(`(${this.splitTop(v.replace(/^\(|\)$/g, '')).map((x) => this.orPart(a, x, params)).join(' and ')})`); continue }
      const dot = k.indexOf('.')
      if (dot > 0 && aliases.has(k.slice(0, dot))) { (emb[k.slice(0, dot)] ??= []).push([k.slice(dot + 1), v]); continue }
      own.push(this.filterSql(a, k, v, params))
    }
    own.push(...this.innerExists(table, a, items, emb, params, ctr))
    return { where: own, emb }
  }

  // ------------------------------------------------------------------ request handling
  async handle(db: PoolClient, method: string, table: string, sp: URLSearchParams, body: unknown, prefer: string, accept: string): Promise<{ status: number; body: unknown; range?: string }> {
    if (!this.colTypes.has(table)) throw new RestError(404, '42P01', `relation "public.${table}" does not exist`)
    const items = this.parseSelect(sp.get('select') ?? '*')
    const params: unknown[] = []; const ctr = { n: 0 }
    const wantRep = /return=representation/.test(prefer)
    const single = /vnd\.pgrst\.object/.test(accept)
    const a = 't0'

    if (method === 'GET' || method === 'HEAD') {
      const { where, emb } = this.whereFor(table, a, sp, items, params, ctr)
      const list = this.selectList(table, a, items, emb, params, ctr)
      const w = where.length ? ` where ${where.join(' and ')}` : ''
      const order = sp.get('order') ? ' order by ' + sp.get('order')!.split(',').map((o) => { const [c, d, n] = o.split('.'); return `${a}.${this.q(c)} ${d === 'desc' ? 'desc' : 'asc'}${n === 'nullsfirst' ? ' nulls first' : n === 'nullslast' ? ' nulls last' : ''}` }).join(', ') : ''
      const limit = sp.get('limit') ? ` limit ${Number(sp.get('limit'))}` : ''
      const offset = sp.get('offset') ? ` offset ${Number(sp.get('offset'))}` : ''
      let total: number | null = null
      if (/count=/.test(prefer)) total = Number((await db.query(`select count(*) from ${this.q(table)} ${a}${w}`, params)).rows[0].count)
      const rows = method === 'HEAD' ? [] : (await db.query(`select ${list} from ${this.q(table)} ${a}${w}${order}${limit}${offset}`, params)).rows
      const off = Number(sp.get('offset') ?? 0)
      const range = `${rows.length ? `${off}-${off + rows.length - 1}` : '*'}/${total ?? '*'}`
      if (single) { if (rows.length !== 1) throw new RestError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned'); return { status: 200, body: rows[0], range } }
      return { status: 200, body: rows, range }
    }

    const types = this.colTypes.get(table)!
    const coerce = (col: string, v: unknown) => { if (v === null || v === undefined) return null; const t = types.get(col); return (t === 'jsonb' || t === 'json') && typeof v !== 'string' ? JSON.stringify(v) : (t === 'jsonb' || t === 'json') ? JSON.stringify(v) : v }
    const returning = async (cte: string) => {
      if (!wantRep) return { status: method === 'POST' ? 201 : 204, body: null as unknown }
      const p2: unknown[] = [...paramsForCte]; const list = this.selectList(table, 'r0', items, {}, p2, { n: 100 })
      const rows = (await db.query(`${cte} select ${list} from ins r0`, p2)).rows
      return { status: method === 'POST' ? 201 : 200, body: single ? rows[0] : rows }
    }
    let paramsForCte: unknown[] = []

    if (method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]) as Array<Record<string, unknown>>
      if (!rows.length) return { status: 201, body: [] }
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      const vals: unknown[] = []
      const tuples = rows.map((r) => `(${cols.map((c) => { if (!(c in r)) return 'default'; vals.push(coerce(c, r[c])); return `$${vals.length}` }).join(',')})`)
      let conflict = ''
      if (/resolution=/.test(prefer)) {
        const oc = (sp.get('on_conflict') ?? (this.pks.get(table) ?? []).join(',')).split(',').map((x) => this.q(x.trim())).join(',')
        conflict = /ignore-duplicates/.test(prefer) ? ` on conflict (${oc}) do nothing` : ` on conflict (${oc}) do update set ${cols.map((c) => `${this.q(c)} = excluded.${this.q(c)}`).join(', ')}`
      }
      const cte = `with ins as (insert into ${this.q(table)} (${cols.map((c) => this.q(c)).join(',')}) values ${tuples.join(',')}${conflict} returning *)`
      paramsForCte = vals
      const r = await returning(cte)
      if (!wantRep) await db.query(`${cte} select 1 from ins`, vals)
      return r
    }
    if (method === 'PATCH') {
      const b = body as Record<string, unknown>
      const cols = Object.keys(b)
      const sets = cols.map((c, i) => `${this.q(c)} = $${i + 1}`)
      const vals: unknown[] = cols.map((c) => coerce(c, b[c]))
      const p: unknown[] = [...vals]
      const { where } = this.whereFor(table, 'u', sp, [], p, ctr)
      const cte = `with ins as (update ${this.q(table)} u set ${sets.join(', ')}${where.length ? ` where ${where.join(' and ')}` : ''} returning u.*)`
      paramsForCte = p
      const r = await returning(cte)
      if (!wantRep) await db.query(`${cte} select 1 from ins`, p)
      return r
    }
    if (method === 'DELETE') {
      const p: unknown[] = []
      const { where } = this.whereFor(table, 'd', sp, [], p, ctr)
      const cte = `with ins as (delete from ${this.q(table)} d${where.length ? ` where ${where.join(' and ')}` : ''} returning d.*)`
      paramsForCte = p
      const r = await returning(cte)
      if (!wantRep) await db.query(`${cte} select 1 from ins`, p)
      return r
    }
    throw new RestError(405, 'PGRST000', 'method not allowed')
  }

  async rpc(db: PoolClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
    const meta = (await db.query(`select p.proretset, t.typtype from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`, [fn])).rows[0]
    if (!meta) throw new RestError(404, 'PGRST202', `Could not find the function public.${fn}`)
    const keys = Object.keys(args)
    const vals = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]))
    const call = `${this.q(fn)}(${keys.map((k, i) => `${this.q(k)} := $${i + 1}`).join(', ')})`
    if (meta.proretset || meta.typtype === 'c') return (await db.query(`select * from ${call}`, vals)).rows
    return (await db.query(`select ${call} as v`, vals)).rows[0].v
  }
}

export class RestError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } }
interface ColItem { kind: 'col'; alias?: string; name: string }
interface EmbedItem { kind: 'embed'; alias: string; rel: string; hint?: string; inner: boolean; items: SelItem[] | 'count' }
type SelItem = ColItem | EmbedItem

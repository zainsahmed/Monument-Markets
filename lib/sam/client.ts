import 'server-only'
import { getEnv } from '@/lib/env'
import { nextQuotaReset } from './plan'
import type { SamSearchParams, SamSearchResponse } from './types'

export const SAM_SEARCH_URL = 'https://api.sam.gov/opportunities/v2/search'

export class SamQuotaError extends Error {
  constructor(public nextAllowedAt: Date, message: string) {
    super(message)
    this.name = 'SamQuotaError'
  }
}
export class SamHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'SamHttpError'
  }
}

export interface SamClient {
  search(p: SamSearchParams): Promise<SamSearchResponse>
  /** Fetches the text behind a notice's `description` URL (counts as a call). */
  fetchDescription(url: string): Promise<string>
  /** Downloads an attachment (counts as a call). */
  download(url: string): Promise<{ bytes: Uint8Array; contentType: string | null; fileName: string | null }>
}

/** Parse "next access time" out of SAM's quota error body, falling back to next UTC midnight. */
export function parseNextAccess(body: string, now = new Date()): Date {
  const m = body.match(/(?:nextAccessTime|next access time)[^0-9]*(\d{4}-\w{3}-\d{2}\s[\d:]+\+?\w*|\d{4}-\d{2}-\d{2}[T ][\d:]+Z?)/i)
  if (m) {
    const d = new Date(m[1].replace(/\+0000$/, 'Z'))
    if (!Number.isNaN(d.getTime()) && d > now) return d
  }
  return nextQuotaReset(now)
}

function withKey(url: string, key: string): string {
  const u = new URL(url)
  u.searchParams.set('api_key', key)
  return u.toString()
}

function classify(res: Response, body: string): never {
  if (res.status === 429 || /quota|throttle|exceeded/i.test(body)) {
    throw new SamQuotaError(parseNextAccess(body), `SAM.gov quota exhausted (${res.status})`)
  }
  throw new SamHttpError(res.status, `SAM.gov returned ${res.status}: ${body.slice(0, 200)}`)
}

export function createSamClient(fetchImpl: typeof fetch = fetch): SamClient {
  const key = () => getEnv().SAM_API_KEY
  return {
    async search(p) {
      const u = new URL(SAM_SEARCH_URL)
      u.searchParams.set('api_key', key())
      u.searchParams.set('postedFrom', p.postedFrom)
      u.searchParams.set('postedTo', p.postedTo)
      u.searchParams.set('limit', String(p.limit))
      u.searchParams.set('offset', String(p.offset))
      if (p.ncode) u.searchParams.set('ncode', p.ncode)
      if (p.ptype) u.searchParams.set('ptype', p.ptype)
      const res = await fetchImpl(u, { headers: { accept: 'application/json' }, cache: 'no-store' })
      const text = await res.text()
      if (!res.ok) classify(res, text)
      let json: Partial<SamSearchResponse>
      try { json = JSON.parse(text) } catch { throw new SamHttpError(res.status, 'SAM.gov returned a non-JSON response') }
      return { totalRecords: json.totalRecords ?? 0, limit: json.limit ?? p.limit, offset: json.offset ?? p.offset, opportunitiesData: json.opportunitiesData ?? [] }
    },
    async fetchDescription(url) {
      const res = await fetchImpl(withKey(url, key()), { cache: 'no-store' })
      const text = await res.text()
      if (!res.ok) classify(res, text)
      // The endpoint returns JSON {"description": "<html>"} (or raw HTML); "Description not found" is an error body.
      try {
        const j = JSON.parse(text) as { description?: string }
        if (typeof j.description === 'string') return j.description
      } catch { /* raw html */ }
      if (/description not found/i.test(text)) throw new SamHttpError(404, 'Description not found')
      return text
    },
    async download(url) {
      const res = await fetchImpl(withKey(url, key()), { redirect: 'follow', cache: 'no-store' })
      if (!res.ok) classify(res, await res.text())
      const cd = res.headers.get('content-disposition') ?? ''
      const fn = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1]
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type'), fileName: fn ? decodeURIComponent(fn) : null }
    },
  }
}

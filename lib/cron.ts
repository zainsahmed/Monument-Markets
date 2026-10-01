import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'

/** Cron routes require "Authorization: Bearer <CRON_SECRET>" (what Vercel Cron sends) or "x-cron-secret". */
export function verifyCron(req: Request): NextResponse | null {
  const secret = getEnv().CRON_SECRET
  const auth = req.headers.get('authorization')
  const given = auth?.startsWith('Bearer ') ? auth.slice(7) : req.headers.get('x-cron-secret') ?? ''
  const a = Buffer.from(given), b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return null
}

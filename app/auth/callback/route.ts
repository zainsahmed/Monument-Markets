import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const safe = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard')

/** PKCE / magic-link / email-verification landing. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = safe(url.searchParams.get('next'))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL('/sign-in?error=' + encodeURIComponent('That link is invalid or has expired. Request a new one.'), url.origin))
}

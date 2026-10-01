import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Token-hash flow used by Supabase email templates ({{ .TokenHash }}). */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = url.searchParams.get('next')
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL(dest, url.origin))
  }
  return NextResponse.redirect(new URL('/sign-in?error=' + encodeURIComponent('That link is invalid or has expired.'), url.origin))
}

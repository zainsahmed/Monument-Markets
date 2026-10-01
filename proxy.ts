import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Refreshes the Supabase session cookie and gates the authenticated app. (Next 16: proxy = middleware.) */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data } = await supabase.auth.getClaims()
  const path = request.nextUrl.pathname
  const isPublic = path.startsWith('/sign-in') || path.startsWith('/auth/')
  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }
  if (data?.claims && path.startsWith('/sign-in')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}

export const config = {
  // Cron routes authenticate with CRON_SECRET, not a user session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)'],
}

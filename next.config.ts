import type { NextConfig } from 'next'

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseWs = supabase.replace(/^http/, 'ws')
const dev = process.env.NODE_ENV !== 'production'

const csp = [
  `default-src 'self'`,
  // Next injects inline bootstrap scripts; a nonce-based CSP would force fully dynamic rendering.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob:`,
  `connect-src 'self' ${supabase} ${supabaseWs}${dev ? ' ws://localhost:* ' : ''}`,
  `worker-src 'self' blob:`,
  `frame-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join('; ')

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  serverExternalPackages: ['pdfjs-dist'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig

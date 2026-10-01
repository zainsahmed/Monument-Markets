import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Fieldpoint', template: '%s · Fieldpoint' },
  description: 'Federal contracting research, analysis, sourcing and pipeline for small businesses.',
}
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F5F5F7' }, { media: '(prefers-color-scheme: dark)', color: '#000000' }],
}

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('fp-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;var d=localStorage.getItem('fp-density');if(d)document.documentElement.dataset.density=d}catch(e){}`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

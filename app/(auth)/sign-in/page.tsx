import type { Metadata } from 'next'
import { Wordmark } from '@/components/app/Wordmark'
import { SignInForm } from './SignInForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : '/dashboard'
  const error = typeof sp.error === 'string' ? sp.error : null
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg-secondary)' }}>
      <div className="card" style={{ width: 'min(400px, 100%)', padding: 32 }}>
        <div style={{ marginBottom: 24 }}><Wordmark size={24} /></div>
        <h1 className="t-title2" style={{ margin: '0 0 4px' }}>Sign in</h1>
        <p className="t-callout" style={{ margin: '0 0 24px', color: 'var(--label-secondary)' }}>Federal contracting research for your team.</p>
        <SignInForm next={next} initialError={error} />
      </div>
    </main>
  )
}

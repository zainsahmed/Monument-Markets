import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/app/Wordmark'
import { getSession } from '@/lib/auth'
import { Onboarding } from './Onboarding'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const s = await getSession()
  if (!s) redirect('/sign-in')
  if (s.companyId && s.company.onboarded_at) redirect('/dashboard')
  // Status only — keys live in server-side environment variables and are never collected here.
  const keys = { sam: !!process.env.SAM_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY, email: !!process.env.RESEND_API_KEY }
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg-secondary)' }}>
      <div style={{ width: 'min(620px, 100%)' }}>
        <div style={{ marginBottom: 24, textAlign: 'center' }}><Wordmark size={24} /></div>
        <Onboarding hasCompany={!!s.companyId} company={s.companyId ? s.company : null} keys={keys} role={s.role} />
      </div>
    </main>
  )
}

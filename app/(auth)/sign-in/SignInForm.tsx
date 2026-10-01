'use client'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Seg } from '@/components/ui/Seg'
import { createBrowser } from '@/lib/supabase/browser'

const Schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().optional() })
type Mode = 'password' | 'link' | 'create'

export function SignInForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [mode, setMode] = useState<Mode>('password')
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(initialError ? { tone: 'error', text: initialError } : null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema) })
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  async function onSubmit(v: z.infer<typeof Schema>) {
    setMsg(null)
    const supabase = createBrowser()
    const redirect = `${location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`
    if (mode === 'link') {
      const { error } = await supabase.auth.signInWithOtp({ email: v.email, options: { emailRedirectTo: redirect } })
      setMsg(error ? { tone: 'error', text: error.message } : { tone: 'info', text: 'Check your email for a sign-in link.' })
      return
    }
    if (!v.password || v.password.length < (mode === 'create' ? 10 : 1)) { setMsg({ tone: 'error', text: mode === 'create' ? 'Use at least 10 characters.' : 'Enter your password.' }); return }
    if (mode === 'create') {
      const { error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: redirect } })
      setMsg(error ? { tone: 'error', text: error.message } : { tone: 'info', text: 'Check your email to verify your address, then sign in.' })
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (error) setMsg({ tone: 'error', text: error.message })
    else location.assign(safeNext)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'grid', gap: 16 }}>
      <Seg label="Sign-in method" value={mode} onChange={(m) => { setMode(m); setMsg(null) }} options={[{ value: 'password', label: 'Password' }, { value: 'link', label: 'Email link' }, { value: 'create', label: 'Create account' }]} />
      <div>
        <label className="field-label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
        {errors.email && <p className="field-error">{errors.email.message}</p>}
      </div>
      {mode !== 'link' && (
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} {...register('password')} />
        </div>
      )}
      {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className="t-callout" style={{ margin: 0, color: msg.tone === 'error' ? 'var(--red)' : 'var(--label-secondary)' }}>{msg.text}</p>}
      <Button variant="primary" type="submit" disabled={isSubmitting} style={{ height: 40 }}>{mode === 'link' ? 'Send link' : mode === 'create' ? 'Create account' : 'Sign in'}</Button>
      <p className="t-footnote" style={{ margin: 0, color: 'var(--label-secondary)' }}>Fieldpoint never asks for your SAM.gov password.</p>
    </form>
  )
}

import 'server-only'
import { Resend } from 'resend'
import { getEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderDigest } from '@/lib/alerts'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Sends unsent alerts by email to users who opted in (per alert type). `digest` users get everything in one
 * message per run (call this once a day); non-digest users get immediate messages (every cron run).
 */
export async function emailSweep(admin: Admin, opts: { digestRun: boolean }): Promise<{ sent: number; skipped: number }> {
  const env = getEnv()
  const resend = new Resend(env.RESEND_API_KEY)
  const { data: pending } = await admin.from('alerts').select('id, user_id, type, title, opportunity_id, link_tab, created_at').is('emailed_at', null).order('created_at', { ascending: true }).limit(500)
  const byUser = new Map<string, NonNullable<typeof pending>>()
  for (const a of pending ?? []) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a])
  let sent = 0, skipped = 0
  for (const [userId, alerts] of byUser) {
    const { data: prefs } = await admin.from('alert_preferences').select('type, email, digest').eq('user_id', userId)
    const pref = new Map((prefs ?? []).map((p) => [p.type, p]))
    const eligible = alerts.filter((a) => {
      const p = pref.get(a.type)
      if (!p?.email) return false // email is opt-in
      return p.digest ? opts.digestRun : true
    })
    if (!eligible.length) { skipped += alerts.length; continue }
    const { data: u } = await admin.auth.admin.getUserById(userId)
    const to = u.user?.email
    if (!to) { skipped += eligible.length; continue }
    const mail = renderDigest(eligible.map((a) => ({ title: a.title, type: a.type, link: a.opportunity_id ? `/opportunities/${a.opportunity_id}?tab=${a.link_tab ?? 'overview'}` : '/alerts', created_at: a.created_at })), env.APP_URL)
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject: mail.subject, html: mail.html, text: mail.text })
    if (error) { skipped += eligible.length; continue }
    await admin.from('alerts').update({ emailed_at: new Date().toISOString() }).in('id', eligible.map((a) => a.id))
    sent += eligible.length
  }
  return { sent, skipped }
}

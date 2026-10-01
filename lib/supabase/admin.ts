import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

/**
 * Service-role client. Bypasses RLS: only use in cron jobs and in routes that have already
 * authenticated the caller and checked company membership (see lib/auth.ts).
 */
export function createAdminClient() {
  const env = getEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

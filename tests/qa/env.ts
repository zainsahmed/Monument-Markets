import { ANON_KEY, SERVICE_KEY } from './shim/server'

/** Environment for running the real Next app against the local QA stack. */
export const qaEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54400',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SAM_API_KEY: 'qa-sam-key-not-real',
  ANTHROPIC_API_KEY: 'qa-anthropic-key-not-real',
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:54401',
  SAM_SEARCH_URL: 'http://127.0.0.1:54402/search',
  CRON_SECRET: 'qa-cron-secret-0123456789abcdef0123',
  RESEND_API_KEY: 'qa-resend-key-not-real',
  APP_URL: 'http://127.0.0.1:3100',
  NEXT_DIST_DIR: '.next-qa',
}
if (process.argv[1]?.endsWith('env.ts')) for (const [k, v] of Object.entries(qaEnv)) console.log(`${k}=${v}`)

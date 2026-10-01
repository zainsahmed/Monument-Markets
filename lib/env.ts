import 'server-only'
import { z } from 'zod'

/**
 * Environment contract. Secrets are server-only: this module imports `server-only`, so any
 * client import fails the build. Public values are read separately in lib/env.public.ts.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SAM_API_KEY: z.string().min(10),
  ANTHROPIC_API_KEY: z.string().min(10),
  CRON_SECRET: z.string().min(24, 'CRON_SECRET must be at least 24 characters'),
  RESEND_API_KEY: z.string().min(10),
  // --- optional tuning ---
  EMAIL_FROM: z.string().default('Fieldpoint <alerts@example.com>'),
  APP_URL: z.url().default('http://localhost:3000'),
  SAM_DAILY_QUOTA: z.coerce.number().int().min(1).max(100000).default(10),
  SAM_RESERVED_CALLS: z.coerce.number().int().min(0).max(1000).default(2),
  AI_MODEL_BRIEF: z.string().default('claude-opus-5-5'),
  AI_MODEL_EXTRACT: z.string().default('claude-opus-5-5'),
  AI_MODEL_SEARCH: z.string().default('claude-opus-5-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  AI_REFUSAL_FALLBACK: z.enum(['on', 'off']).default('on'),
})

export type ServerEnv = z.infer<typeof serverSchema>
let cached: ServerEnv | undefined

/** Parses and caches env. Throws a single readable error listing every problem. */
export function getEnv(): ServerEnv {
  if (cached) return cached
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid or missing environment variables:\n${lines.join('\n')}\nSee .env.example.`)
  }
  cached = parsed.data
  return cached
}

export const envSchemaForTests = serverSchema

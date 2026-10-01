/** Per-million-token USD rates (Anthropic first-party list prices, cached 2026-09-25). */
interface Rate { input: number; output: number; cacheRead: number }
const RATES: Record<string, Rate> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheRead: 0.1 },
}
/** Used when a model isn't in the table: deliberately the most expensive known rate, never zero. */
const FALLBACK: Rate = { input: 10, output: 50, cacheRead: 1 }
const CACHE_WRITE_MULTIPLIER = 1.25

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }

export function costUsd(model: string, u: Usage): number {
  const r = RATES[model] ?? FALLBACK
  const cacheRead = u.cache_read_input_tokens ?? 0
  const cacheWrite = u.cache_creation_input_tokens ?? 0
  const usd = (u.input_tokens * r.input + cacheWrite * r.input * CACHE_WRITE_MULTIPLIER + cacheRead * r.cacheRead + u.output_tokens * r.output) / 1_000_000
  return Math.round(usd * 10000) / 10000
}
export const isKnownModel = (m: string) => m in RATES

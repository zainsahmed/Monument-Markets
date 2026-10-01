import Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'
import { costUsd, type Usage } from './cost'
import { normaliseLabels } from './postprocess'
import { toApiJsonSchema } from './schemas'

/** Everything that talks to Claude goes through this module (spec §7.1). Server-side only. */

export class AiRefusalError extends Error {
  constructor(public category: string | null, message = 'The model declined this request.') { super(message); this.name = 'AiRefusalError' }
}
export class AiOutputError extends Error {
  constructor(message: string, public usage: Usage, public model: string) { super(message); this.name = 'AiOutputError' }
}
export class AiBudgetError extends Error {
  constructor(public spent: number, public cap: number) { super(`Monthly AI budget reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}). Raise the cap in Settings to run new analyses.`); this.name = 'AiBudgetError' }
}

/** The slice of the SDK we use, so tests can inject a fake. */
export interface StreamLike {
  finalMessage(): Promise<{
    model: string
    stop_reason: string | null
    stop_details?: { category?: string | null; explanation?: string | null } | null
    content: Array<{ type: string; text?: string }>
    usage: Usage
  }>
}
export interface ClaudeClient {
  beta: { messages: { stream(params: Record<string, unknown>): StreamLike } }
}

export interface StructuredCall<S extends z.ZodType> {
  client: ClaudeClient
  model: string
  schema: S
  system: string
  /** large, stable context (document text) — cached */
  cachedContext?: string
  /** per-request context (company profile, task text) */
  task: string
  maxTokens?: number
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  fallback?: boolean
}
export interface StructuredResult<T> {
  data: T
  usage: Usage
  model: string
  attempts: number
  costUsd: number
}

const add = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
})

/**
 * One structured-output call. Output must match the schema; invalid output is retried ONCE with the
 * validation error, then surfaced as an error — it is never partially rendered as fact.
 */
export async function callStructured<S extends z.ZodType>(c: StructuredCall<S>): Promise<StructuredResult<z.infer<S>>> {
  const jsonSchema = toApiJsonSchema(c.schema)
  let usage: Usage = { input_tokens: 0, output_tokens: 0 }
  let lastError = ''
  let model = c.model

  for (let attempt = 1; attempt <= 2; attempt++) {
    const content: Array<Record<string, unknown>> = []
    if (c.cachedContext) content.push({ type: 'text', text: c.cachedContext, cache_control: { type: 'ephemeral' } })
    content.push({ type: 'text', text: attempt === 1 ? c.task : `${c.task}\n\nYour previous reply did not match the required JSON schema (${lastError}). Reply again with valid JSON only.` })

    const params: Record<string, unknown> = {
      model: c.model,
      max_tokens: c.maxTokens ?? 32000,
      system: [{ type: 'text', text: c.system }],
      messages: [{ role: 'user', content }],
      // thinking is always on for these models; depth is controlled by effort only
      output_config: { effort: c.effort ?? 'high', format: { type: 'json_schema', schema: jsonSchema } },
    }
    if (c.fallback) {
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }
    const msg = await c.client.beta.messages.stream(params).finalMessage()
    usage = add(usage, msg.usage)
    model = msg.model || model

    if (msg.stop_reason === 'refusal') throw new AiRefusalError(msg.stop_details?.category ?? null, msg.stop_details?.explanation ?? undefined)
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    if (msg.stop_reason === 'max_tokens') {
      lastError = 'output was truncated at max_tokens'
      continue
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      lastError = 'not valid JSON'
      continue
    }
    const parsed = c.schema.safeParse(normaliseLabels(json))
    if (parsed.success) return { data: parsed.data, usage, model, attempts: attempt, costUsd: costUsd(model, usage) }
    lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  }
  throw new AiOutputError(`The model returned output that did not match the required format twice (${lastError}). Nothing was saved.`, usage, model)
}

export function createClaudeClient(apiKey: string): ClaudeClient {
  const client = new Anthropic({ apiKey })
  return client as unknown as ClaudeClient
}

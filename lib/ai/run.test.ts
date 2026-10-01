import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AiOutputError, AiRefusalError, callStructured, type ClaudeClient } from './run'
import { costUsd } from './cost'
import { StatementSchema } from './schemas'

const Schema = z.object({ items: z.array(StatementSchema) })
const valid = { items: [{ text: 'x', label: 'ANALYSIS', citations: [] }] }
const usage = (i = 100, o = 50) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

function fake(replies: Array<{ text?: string; stop_reason?: string; stop_details?: { category: string } }>) {
  const calls: Array<Record<string, any>> = []
  let i = 0
  const client: ClaudeClient = {
    beta: { messages: { stream: (p) => { calls.push(p); const r = replies[i++]; return { finalMessage: async () => ({ model: 'claude-opus-5-5', stop_reason: r.stop_reason ?? 'end_turn', stop_details: r.stop_details, content: [{ type: 'text', text: r.text ?? '' }], usage: usage() }) } } } },
  }
  return { client, calls }
}
const base = (client: ClaudeClient) => ({ client, model: 'claude-opus-5-5', schema: Schema, system: 'sys', task: 'do it', cachedContext: 'DOCS' })

describe('callStructured', () => {
  it('returns validated data and cost, using output_config.format and cached context', async () => {
    const { client, calls } = fake([{ text: JSON.stringify(valid) }])
    const r = await callStructured({ ...base(client), fallback: true })
    expect(r.data).toEqual(valid)
    expect(r.attempts).toBe(1)
    expect(r.costUsd).toBeGreaterThan(0)
    const p = calls[0]
    expect(p.output_config.format.type).toBe('json_schema')
    expect(p.output_config.effort).toBe('high')
    expect(p.thinking).toBeUndefined()
    expect(p.temperature).toBeUndefined()
    expect(p.tool_choice).toBeUndefined()
    expect(p.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(p.fallbacks).toBe('default')
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01'])
  })
  it('normalises label casing drift', async () => {
    const { client } = fake([{ text: JSON.stringify({ items: [{ text: 'x', label: 'AI Analysis', citations: [] }] }) }])
    expect((await callStructured(base(client))).data.items[0].label).toBe('ANALYSIS')
  })
  it('retries once on invalid output, accumulating usage', async () => {
    const { client, calls } = fake([{ text: '{"items": "bad"}' }, { text: JSON.stringify(valid) }])
    const r = await callStructured(base(client))
    expect(r.attempts).toBe(2)
    expect(r.usage.input_tokens).toBe(200)
    expect(JSON.stringify(calls[1].messages)).toMatch(/did not match the required JSON schema/)
  })
  it('errors (never partially renders) after a second invalid reply', async () => {
    const { client } = fake([{ text: 'not json' }, { text: '{"items": 3}' }])
    await expect(callStructured(base(client))).rejects.toBeInstanceOf(AiOutputError)
  })
  it('retries truncated output, then errors', async () => {
    const { client } = fake([{ text: '{"items":[', stop_reason: 'max_tokens' }, { text: '{"items":[', stop_reason: 'max_tokens' }])
    await expect(callStructured(base(client))).rejects.toThrow(/did not match/)
  })
  it('surfaces refusals with their category and does not retry', async () => {
    const { client, calls } = fake([{ stop_reason: 'refusal', stop_details: { category: 'cyber' } }])
    await expect(callStructured(base(client))).rejects.toMatchObject({ name: 'AiRefusalError', category: 'cyber' })
    expect(calls).toHaveLength(1)
    expect(new AiRefusalError(null).message).toMatch(/declined/)
  })
})

describe('costUsd', () => {
  it('prices input, output, cache reads and cache writes', () => {
    expect(costUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4)
    expect(costUsd('claude-opus-5-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(20)
    expect(costUsd('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 })).toBe(0.2)
    expect(costUsd('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBe(5)
  })
  it('never prices an unknown model at zero', () => {
    expect(costUsd('mystery-model', { input_tokens: 1_000_000, output_tokens: 0 })).toBeGreaterThan(0)
  })
})

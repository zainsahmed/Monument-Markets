import { describe, expect, it } from 'vitest'
import { BriefSchema, ExtractionSchema, SearchFiltersSchema, toApiJsonSchema } from './schemas'

const FORBIDDEN = ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf', '$schema', 'format', 'pattern']
function collect(n: unknown, acc: { keys: Set<string>; objects: Array<Record<string, unknown>>; optionalProps: number; unions: number } = { keys: new Set(), objects: [], optionalProps: 0, unions: 0 }) {
  if (Array.isArray(n)) n.forEach((x) => collect(x, acc))
  else if (n && typeof n === 'object') {
    const o = n as Record<string, unknown>
    Object.keys(o).forEach((k) => acc.keys.add(k))
    if (o.type === 'object') {
      acc.objects.push(o)
      const props = Object.keys((o.properties as object) ?? {})
      const req = (o.required as string[]) ?? []
      acc.optionalProps += props.filter((p) => !req.includes(p)).length
    }
    if (o.anyOf || o.oneOf) acc.unions++
    Object.values(o).forEach((v) => collect(v, acc))
  }
  return acc
}

describe('structured-output schemas stay inside the API subset', () => {
  for (const [name, schema] of [['brief', BriefSchema], ['extraction', ExtractionSchema], ['search', SearchFiltersSchema]] as const) {
    it(`${name}: no unsupported keywords, strict objects, nothing optional or union-typed`, () => {
      const js = toApiJsonSchema(schema)
      const c = collect(js)
      for (const k of FORBIDDEN) expect(c.keys.has(k), k).toBe(false)
      expect(c.objects.length).toBeGreaterThan(0)
      for (const o of c.objects) expect(o.additionalProperties).toBe(false)
      expect(c.optionalProps).toBe(0)
      expect(c.unions).toBe(0)
    })
  }
})

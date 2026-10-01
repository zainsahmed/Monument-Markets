/** WCAG 2.x contrast helpers (used by the design-token test). */
export function parseColor(c: string): [number, number, number, number] {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/)
  if (!m) throw new Error(`bad colour ${c}`)
  const p = m[1].split(',').map((x) => parseFloat(x))
  return [p[0], p[1], p[2], p[3] ?? 1]
}
export function over(fg: string, bg: string): [number, number, number] {
  const [r, g, b, a] = parseColor(fg)
  const [br, bgc, bb] = parseColor(bg)
  return [r * a + br * (1 - a), g * a + bgc * (1 - a), b * a + bb * (1 - a)]
}
const lin = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export function contrast(fg: string, bg: string): number {
  const a = luminance(over(fg, bg))
  const b = luminance(parseColor(bg).slice(0, 3) as [number, number, number])
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}
/** Contrast of `fg` text on a tint of `fill` (alpha) over `bg` — how badges render. */
export function contrastOnTint(fg: string, bg: string, tintAlpha = 0.12): number {
  const [r, g, b] = parseColor(fg)
  const tinted = over(`rgba(${r},${g},${b},${tintAlpha})`, bg)
  const bgHex = '#' + tinted.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
  return contrast(fg, bgHex)
}

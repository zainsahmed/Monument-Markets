import { describe, expect, it } from 'vitest'
import { colors } from './tokens'
import { contrast, contrastOnTint } from './contrast'

describe('design tokens meet WCAG AA', () => {
  for (const mode of ['light', 'dark'] as const) {
    const c = colors[mode]
    it(`${mode}: body text on every surface >= 4.5`, () => {
      for (const bg of ['bg-primary', 'bg-secondary', 'bg-tertiary'])
        for (const fg of ['label-primary', 'label-secondary'])
          expect(contrast(c[fg], c[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${mode}: accent / status text on primary background >= 4.5`, () => {
      for (const fg of ['accent', 'green', 'yellow', 'red', 'gray'])
        expect(contrast(c[fg], c['bg-primary']), fg).toBeGreaterThanOrEqual(4.5)
    })
    it(`${mode}: status text on its 12% tinted badge fill >= 4.5`, () => {
      for (const fg of ['accent', 'green', 'red', 'gray']) {
        expect(contrastOnTint(c[fg], c['bg-primary']), fg).toBeGreaterThanOrEqual(4.5)
        expect(contrastOnTint(c[fg], c['bg-secondary']), fg + ' on secondary').toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(c.yellow, c['yellow-fill'])).toBeGreaterThanOrEqual(4.5)
    })
    it(`${mode}: primary button text on accent >= 4.5`, () => {
      expect(contrast(c['accent-contrast'], c.accent)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

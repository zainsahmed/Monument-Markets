/**
 * Design tokens — the single source of truth for Fieldpoint's visual system (spec §3).
 * `scripts/gen-tokens.ts` turns this into app/tokens.css; Tailwind consumes the CSS variables.
 * Never hard-code a colour, size, radius or duration outside this file.
 */

export type Mode = 'light' | 'dark'

export const colors: Record<Mode, Record<string, string>> = {
  light: {
    'bg-primary': '#FFFFFF',
    'bg-secondary': '#F5F5F7',
    'bg-tertiary': '#EBEBF0',
    'label-primary': '#1D1D1F',
    'label-secondary': '#636366', // spec #6E6E73 fails AA on bg-tertiary (4.27)
    'label-tertiary': '#8E8E93', // placeholder / disabled (AA on white is not required for disabled)
    separator: 'rgba(60,60,67,0.12)',
    accent: '#0A58C6', // spec #0A60D6 is 4.44:1 on tinted-on-secondary; nudged for AA
    'accent-contrast': '#FFFFFF',
    green: '#16703B', // spec #1F8A4C is 3.8:1 on 12% tint; darkened for AA
    yellow: '#8A5A00', // text variant of #B7791F, darkened to pass AA on its fill
    'yellow-fill': '#FFF4D6',
    red: '#B02A20', // spec #C9372C is 4.3:1 on 12% tint; darkened for AA
    gray: '#5C5C61', // spec #8E8E93 text is ~3.3:1; text-safe gray
    // translucent chrome
    'material-sidebar': 'rgba(245,245,247,0.72)',
    'material-toolbar': 'rgba(255,255,255,0.72)',
    'material-solid': '#F5F5F7',
    shadow: 'rgba(0,0,0,0.12)',
    'shadow-soft': 'rgba(0,0,0,0.06)',
  },
  dark: {
    'bg-primary': '#1C1C1E',
    'bg-secondary': '#000000',
    'bg-tertiary': '#2C2C2E',
    'label-primary': '#F5F5F7',
    'label-secondary': '#98989D',
    'label-tertiary': '#6C6C70',
    separator: 'rgba(84,84,88,0.45)',
    accent: '#5A9BFF', // spec #3D8BFF is 4.41 on 12% tint
    'accent-contrast': '#000000',
    green: '#34C46F',
    yellow: '#F0B545',
    'yellow-fill': '#3A2E0F',
    red: '#FF6B5E',
    gray: '#98989D',
    'material-sidebar': 'rgba(28,28,30,0.72)',
    'material-toolbar': 'rgba(28,28,30,0.72)',
    'material-solid': '#1C1C1E',
    shadow: 'rgba(0,0,0,0.5)',
    'shadow-soft': 'rgba(0,0,0,0.3)',
  },
}

export const fontStack = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
}

/** [size px, line-height px, weight, letter-spacing em] */
export const type = {
  largeTitle: [34, 41, 700, -0.02],
  title1: [28, 34, 700, -0.02],
  title2: [22, 28, 600, -0.01],
  title3: [20, 25, 600, -0.01],
  headline: [17, 22, 600, 0],
  body: [15, 22, 400, 0],
  callout: [14, 20, 400, 0],
  subheadline: [13, 18, 500, 0],
  footnote: [12, 16, 400, 0],
  caption: [11, 13, 500, 0.06],
  metric: [40, 44, 600, -0.02],
} as const satisfies Record<string, readonly [number, number, number, number]>

/** 4pt grid — Tailwind's default `--spacing: 4px` multiples; nothing off this list is allowed. */
export const spacing = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 } as const

export const motion = {
  easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  fast: 180,
  base: 240,
  slow: 320,
} as const

export const layout = { sidebar: 240, sidebarCollapsed: 56, inspector: 320, maxContent: 1440, toolbar: 52 } as const

/** Elevation: only floating layers get a shadow. */
export const elevation = {
  floating: '0 8px 32px var(--shadow), 0 1px 2px var(--shadow-soft)',
}

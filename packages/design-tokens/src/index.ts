// Platform-neutral design tokens. Web consumes the same values through CSS variables in apps/web/src/index.css
// (tests/css-sync.test.ts fails if they drift); React Native consumes them directly.
export type Rgb = readonly [number, number, number]
export type ColorName =
  | 'background' | 'foreground' | 'sidebar' | 'card' | 'border' | 'muted' | 'mutedForeground'
  | 'primary' | 'primarySolid' | 'primaryForeground' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'dangerSolid'
  | 'surface2' | 'indigo'
export type ChartColorName = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'grid' | 'axis'

export const colors: Record<'light' | 'dark', Record<ColorName, Rgb>> = {
  light: {
    background: [248, 248, 250], foreground: [9, 9, 11], sidebar: [242, 242, 245], card: [255, 255, 255], border: [228, 228, 233],
    muted: [241, 241, 244], mutedForeground: [99, 99, 107], primary: [124, 58, 237], primarySolid: [124, 58, 237], primaryForeground: [255, 255, 255],
    secondary: [109, 40, 217], accent: [237, 233, 254], success: [22, 101, 52], warning: [146, 64, 14], danger: [185, 28, 28], dangerSolid: [185, 28, 28],
    surface2: [244, 244, 247], indigo: [79, 70, 229],
  },
  dark: {
    background: [9, 9, 11], foreground: [250, 250, 250], sidebar: [13, 13, 16], card: [17, 17, 20], border: [39, 39, 44],
    muted: [32, 32, 37], mutedForeground: [161, 161, 170], primary: [139, 92, 246], primarySolid: [124, 58, 237], primaryForeground: [255, 255, 255],
    secondary: [167, 139, 250], accent: [39, 39, 44], success: [34, 197, 94], warning: [245, 158, 11], danger: [248, 113, 113], dangerSolid: [220, 38, 38],
    surface2: [24, 24, 27], indigo: [99, 102, 241],
  },
}

export const chartColors: Record<'light' | 'dark', Record<ChartColorName, string>> = {
  light: { primary: '#7c3aed', secondary: '#a78bfa', success: '#16a34a', warning: '#d97706', danger: '#dc2626', grid: '#e7e7ec', axis: '#71717a' },
  dark: { primary: '#8b5cf6', secondary: '#a78bfa', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', grid: '#222227', axis: '#a1a1aa' },
}

/** Categorical series colours (pie/donut slices, multi-series charts). Same on every platform and theme. */
export const chartPalette = ['#8B5CF6', '#22C55E', '#F59E0B', '#3B82F6', '#EC4899', '#14B8A6', '#EF4444', '#A1A1AA'] as const

/**
 * Each module's accent, so every platform agrees on what Finance or Fitness looks like. `from`/`to` are the gradient,
 * `text` is the shade that stays readable on that theme's surfaces. Web mirrors these as CSS variables in apps/web/src/index.css.
 */
export type ModuleName =
  | 'dashboard' | 'planner' | 'focus' | 'habits' | 'notes' | 'learning' | 'jobs' | 'goals' | 'fitness' | 'health' | 'finance'
  | 'analytics' | 'reports' | 'notifications' | 'settings' | 'export'
export const moduleAccents: Record<ModuleName, { from: string; to: string; text: { light: string; dark: string } }> = {
  dashboard: { from: '#8B5CF6', to: '#6366F1', text: { light: '#6D28D9', dark: '#A78BFA' } },
  planner: { from: '#6366F1', to: '#3B82F6', text: { light: '#4338CA', dark: '#A5B4FC' } },
  focus: { from: '#A855F7', to: '#EC4899', text: { light: '#9333EA', dark: '#D8B4FE' } },
  habits: { from: '#F43F5E', to: '#FB923C', text: { light: '#BE123C', dark: '#FDA4AF' } },
  notes: { from: '#EAB308', to: '#F59E0B', text: { light: '#A16207', dark: '#FDE047' } },
  learning: { from: '#8B5CF6', to: '#3B82F6', text: { light: '#6D28D9', dark: '#C4B5FD' } },
  jobs: { from: '#F59E0B', to: '#F97316', text: { light: '#B45309', dark: '#FCD34D' } },
  goals: { from: '#EC4899', to: '#8B5CF6', text: { light: '#BE185D', dark: '#F9A8D4' } },
  fitness: { from: '#F97316', to: '#EF4444', text: { light: '#C2410C', dark: '#FDBA74' } },
  health: { from: '#38BDF8', to: '#6366F1', text: { light: '#0369A1', dark: '#7DD3FC' } },
  finance: { from: '#10B981', to: '#14B8A6', text: { light: '#047857', dark: '#6EE7B7' } },
  analytics: { from: '#6366F1', to: '#8B5CF6', text: { light: '#4338CA', dark: '#A5B4FC' } },
  reports: { from: '#64748B', to: '#6366F1', text: { light: '#475569', dark: '#CBD5E1' } },
  notifications: { from: '#8B5CF6', to: '#EC4899', text: { light: '#6D28D9', dark: '#C4B5FD' } },
  settings: { from: '#71717A', to: '#8B5CF6', text: { light: '#52525B', dark: '#D4D4D8' } },
  export: { from: '#14B8A6', to: '#6366F1', text: { light: '#0F766E', dark: '#5EEAD4' } },
}

/** Motion standards shared by web and native. Durations in milliseconds. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  count: 700,
  easeOut: [0.22, 1, 0.36, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  spring: { stiffness: 420, damping: 32 },
  springSoft: { stiffness: 220, damping: 26 },
} as const

export const radius = { sm: 6, md: 10, lg: 14, xl: 18, xxl: 22 } as const
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const fontFamily = { sans: 'Inter' } as const
export const brand = { splashBackground: '#09090B', themeColor: '#09090B' } as const

export const rgb = (c: Rgb): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
export const rgba = (c: Rgb, a: number): string => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
/** Resolve a full theme as ready-to-use CSS color strings (what React Native style props expect). */
export const theme = (scheme: 'light' | 'dark'): Record<ColorName, string> =>
  Object.fromEntries(Object.entries(colors[scheme]).map(([k, v]) => [k, rgb(v)])) as Record<ColorName, string>

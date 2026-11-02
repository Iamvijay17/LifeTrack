// Platform-neutral design tokens. Web consumes the same values through CSS variables in apps/web/src/index.css
// (tests/css-sync.test.ts fails if they drift); React Native consumes them directly.
export type Rgb = readonly [number, number, number]
export type ColorName =
  | 'background' | 'foreground' | 'sidebar' | 'card' | 'border' | 'muted' | 'mutedForeground'
  | 'primary' | 'primaryForeground' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger'
export type ChartColorName = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'grid' | 'axis'

export const colors: Record<'light' | 'dark', Record<ColorName, Rgb>> = {
  light: {
    background: [250, 250, 250], foreground: [9, 9, 11], sidebar: [244, 244, 245], card: [255, 255, 255], border: [228, 228, 231],
    muted: [244, 244, 245], mutedForeground: [113, 113, 122], primary: [124, 58, 237], primaryForeground: [255, 255, 255],
    secondary: [109, 40, 217], accent: [237, 233, 254], success: [22, 163, 74], warning: [217, 119, 6], danger: [220, 38, 38],
  },
  dark: {
    background: [9, 9, 11], foreground: [250, 250, 250], sidebar: [17, 17, 19], card: [24, 24, 27], border: [39, 39, 42],
    muted: [39, 39, 42], mutedForeground: [161, 161, 170], primary: [139, 92, 246], primaryForeground: [255, 255, 255],
    secondary: [167, 139, 250], accent: [39, 39, 42], success: [34, 197, 94], warning: [245, 158, 11], danger: [239, 68, 68],
  },
}

export const chartColors: Record<'light' | 'dark', Record<ChartColorName, string>> = {
  light: { primary: '#7c3aed', secondary: '#a78bfa', success: '#16a34a', warning: '#d97706', danger: '#dc2626', grid: '#e4e4e7', axis: '#71717a' },
  dark: { primary: '#8b5cf6', secondary: '#a78bfa', success: '#22c55e', warning: '#f59e0b', danger: '#ef4444', grid: '#27272a', axis: '#a1a1aa' },
}

export const radius = { sm: 4, md: 6, lg: 8 } as const
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const fontFamily = { sans: 'Inter' } as const
export const brand = { splashBackground: '#09090B', themeColor: '#09090B' } as const

export const rgb = (c: Rgb): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
export const rgba = (c: Rgb, a: number): string => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
/** Resolve a full theme as ready-to-use CSS color strings (what React Native style props expect). */
export const theme = (scheme: 'light' | 'dark'): Record<ColorName, string> =>
  Object.fromEntries(Object.entries(colors[scheme]).map(([k, v]) => [k, rgb(v)])) as Record<ColorName, string>

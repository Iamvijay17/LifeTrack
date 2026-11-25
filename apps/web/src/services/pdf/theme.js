// The shared look of every exported PDF: white paper, one brand accent, quiet greys. Printed output, not a copy of the dark app UI.
export const PAGE = {
  portrait: { w: 595.28, h: 841.89 },
  landscape: { w: 841.89, h: 595.28 },
}
export const MARGIN = { x: 40, top: 44, bottom: 50 }

export const COLORS = {
  ink: '#111827',
  body: '#1f2937',
  muted: '#6b7280',
  faint: '#9ca3af',
  rule: '#e5e7eb',
  zebra: '#f8fafc',
  head: '#eef2ff',
  panel: '#f9fafb',
  accent: '#4f46e5',
  accentSoft: '#e0e7ff',
  good: '#047857',
  bad: '#b91c1c',
  warn: '#b45309',
}

/** Print-safe series colours: distinguishable on a greyscale printer too (they differ in lightness, not just hue). */
export const SERIES = ['#4f46e5', '#0f766e', '#b45309', '#be185d', '#1d4ed8', '#65a30d', '#7c3aed', '#475569']

export const TYPE = {
  title: 22,
  subtitle: 11,
  h1: 13,
  h2: 10.5,
  body: 9,
  small: 8,
  tiny: 7,
}

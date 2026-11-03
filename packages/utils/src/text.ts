/** "React, #Interview, react" → ['react','interview'] (lower-case, unique, max 12). */
export const parseTags = (s: unknown): string[] =>
  [...new Set(String(s ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12)

/** Whole-number percentage of n out of d (0 when d is 0). */
export const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0)
/** "1 session" / "3 sessions". */
export const plural = (n: number, s: string, p: string = s + 's'): string => `${n} ${n === 1 ? s : p}`

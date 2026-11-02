/** "React, #Interview, react" → ['react','interview'] (lower-case, unique, max 12). */
export const parseTags = (s: unknown): string[] =>
  [...new Set(String(s ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12)

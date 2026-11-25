/** "React, #Interview, react" → ['react','interview'] (lower-case, unique, max 12). */
export const parseTags = (s: unknown): string[] =>
  [...new Set(String(s ?? '').split(',').map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean))].slice(0, 12)

/** Whole-number percentage of n out of d (0 when d is 0). */
export const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0)
/** "1 session" / "3 sessions". */
export const plural = (n: number, s: string, p: string = s + 's'): string => `${n} ${n === 1 ? s : p}`

// ---- Count-up numbers: shared by the web and native animated values, so both count the same way and land on exactly the same text.
export type CountPart = string | { value: number; decimals: number; grouped: boolean; fixed: boolean; raw: string }

/** Splits "₹12,345" or "2h 30m" into its text and its numbers. The second number of "3/5" is a total, so it is marked to stand still. */
export function parseCountable(text: string): CountPart[] {
  const parts: CountPart[] = []
  let last = 0
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = match[0]
    const at = match.index ?? 0
    parts.push(text.slice(last, at))
    parts.push({ value: Number(raw.replaceAll(',', '')), decimals: raw.split('.')[1]?.length ?? 0, grouped: raw.includes(','), fixed: text[at - 1] === '/', raw })
    last = at + raw.length
  }
  parts.push(text.slice(last))
  return parts
}

/** The text at progress `t` (0-1) of counting from `from` (the previous value's parts, or zero) to `parts`. */
export function drawCountable(parts: CountPart[], from: CountPart[] | null, t: number): string {
  const starts = from?.filter((x) => typeof x === 'object') as { value: number }[] | undefined
  let n = -1
  return parts
    .map((part) => {
      if (typeof part === 'string') return part
      n++
      if (part.fixed) return part.raw
      const start = starts?.[n]?.value ?? 0
      const value = start + (part.value - start) * t
      return value.toLocaleString(part.grouped ? 'en-IN' : 'en-US', { minimumFractionDigits: part.decimals, maximumFractionDigits: part.decimals, useGrouping: part.grouped })
    })
    .join('')
}
export const hasCountable = (parts: CountPart[]) => parts.some((x) => typeof x === 'object')

/** 0.4 -> '40%'; null/undefined -> '—' (no data is not 0%). */
export const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)

/** "just now" / "5m ago" / "3h ago" / "2d ago". `nowMs` is injectable so it can be tested. */
export function relativeTime(iso, nowMs = Date.now()) {
  const mins = Math.round((nowMs - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

/** A noun for `n` things: "task" → "tasks", "entry" → "entries" (a consonant + y), "day" → "days"; `n === 1` keeps it as it is. */
export const pluralWord = (word, n = 2) => (n === 1 ? word : /[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`)

/** "1 rejection", "3 rejections", "2 entries". */
export const plural = (n, word) => `${n} ${pluralWord(word, n)}`

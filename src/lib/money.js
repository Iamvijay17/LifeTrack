// Money is always an integer number of paise (1 INR = 100 paise). Never use floats for storage.
export const CURRENCIES = {
  INR: { locale: 'en-IN', symbol: '₹' },
  USD: { locale: 'en-US', symbol: '$' },
  EUR: { locale: 'de-DE', symbol: '€' },
}

/** Parse a user-typed amount ("1,250.5") to integer paise using string math only. Returns null if invalid. */
export function parseMoney(input) {
  if (input == null) return null
  const s = String(input).replace(/[,\s₹$€]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

export function paiseToInput(paise) {
  if (paise == null) return ''
  const w = Math.trunc(paise / 100)
  const f = String(paise % 100).padStart(2, '0')
  return f === '00' ? String(w) : `${w}.${f}`
}

export function formatMoney(paise, currency = 'INR', { compact = false } = {}) {
  const cfg = CURRENCIES[currency] ?? CURRENCIES.INR
  const value = (paise ?? 0) / 100
  const hasFraction = !compact && Math.abs(paise ?? 0) % 100 !== 0
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value)
}

/** Annual package helpers: users enter lakhs per annum (LPA); stored as paise per year. */
export const lpaToPaise = (lpa) => {
  const p = parseMoney(lpa)
  return p == null ? null : p * 100000
}
export const paiseToLpa = (paise) => (paise == null ? null : paise / 100 / 100000)

/** '12 LPA' for a stored package (paise per year), or null when there is none. */
export const formatLpa = (paise) => (paise == null ? null : `${paiseToLpa(paise)} LPA`)

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...a) => twMerge(clsx(a))
export { uid } from '@lifetrack/utils'
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
export const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`

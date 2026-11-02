// Shared Zod building blocks so every form validates the same way.
import { z } from 'zod'
import { isValidDay } from '@/lib/dates'
import { parseMoney } from '@/lib/money'

/** A 'yyyy-MM-dd' date, or '' when the field is optional. */
export const optionalDay = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')

/** A required 'yyyy-MM-dd' date. */
export const requiredDay = (message = 'Pick a date') => z.string().refine(isValidDay, message)

/**
 * A money amount typed as text ("1,250.50") that must parse to integer paise.
 * `min` is the smallest allowed amount in paise (1 = must be greater than zero, 0 = zero allowed).
 */
export const moneyField = (message, { min = 1 } = {}) =>
  z
    .string()
    .trim()
    .refine((v) => {
      const p = parseMoney(v)
      return p !== null && p >= min
    }, message)

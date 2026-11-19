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

/** A number typed into a field: 0 or more, at most `max`, with a labelled error. */
export const nonNegativeNumber = (max, label) =>
  z.coerce
    .number({ error: `${label}: enter a number` })
    .min(0, `${label} can’t be negative`)
    .max(max, `${label} is too large`)

/** Like nonNegativeNumber, but the field may be left blank ('' means "not provided"). */
export const optionalNumber = (max, label) => z.union([z.literal(''), nonNegativeNumber(max, label)])

/**
 * A count stored in an integer column (reps, minutes): 0 or more, at most `max`, and whole (the database refuses 12.5).
 * A refine, not `.int()`: inside optionalWholeNumber's union an `.int()` failure would only say "Invalid input".
 */
export const wholeNumber = (max, label) => nonNegativeNumber(max, label).refine(Number.isInteger, `${label}: use a whole number`)

/** Like wholeNumber, but the field may be left blank. */
export const optionalWholeNumber = (max, label) => z.union([z.literal(''), wholeNumber(max, label)])

/** A time of day 'HH:MM', or '' when left blank. */
export const optionalTime = z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use HH:MM')

/** A number typed as text that must lie in [min, max]; '' (blank) is allowed. `{ int: true }` also asks for a whole number (integer columns). */
export const numberInRange = (min, max, label, { int = false } = {}) =>
  z
    .string()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), `${label}: ${min}–${max}`)
    .refine((v) => !int || v === '' || Number.isInteger(Number(v)), `${label}: use a whole number`)

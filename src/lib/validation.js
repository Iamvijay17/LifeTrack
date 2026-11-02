// Shared Zod building blocks so every form validates the same way.
import { z } from 'zod'
import { isValidDay } from '@/lib/dates'

/** A 'yyyy-MM-dd' date, or '' when the field is optional. */
export const optionalDay = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')

/** A required 'yyyy-MM-dd' date. */
export const requiredDay = (message = 'Pick a date') => z.string().refine(isValidDay, message)

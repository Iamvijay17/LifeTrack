import { z } from 'zod'

// Rules and messages match apps/web's sign-in/sign-up forms exactly.
export const emailSchema = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email')
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(72, 'Too long')
export const nameSchema = z.string().trim().min(1, 'Enter your name').max(80)

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') })
export const signUpSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export const forgotPasswordSchema = z.object({ email: emailSchema })

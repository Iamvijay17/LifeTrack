import { useCallback, useState } from 'react'
import type { z } from 'zod'

/** Minimal form state for a Zod schema: string-friendly values, per-field errors, validate() → parsed output or null. */
export function useZodForm<S extends z.ZodTypeAny>(schema: S, initial: z.input<S>) {
  const [values, setValues] = useState<z.input<S>>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = useCallback(<K extends keyof z.input<S>>(key: K, value: z.input<S>[K]) => {
    setValues((v: z.input<S>) => ({ ...v, [key]: value }))
    setErrors((e) => { if (!(key as string in e)) return e; const { [key as string]: _drop, ...rest } = e; return rest })
  }, [])
  const reset = useCallback((next: z.input<S>) => { setValues(next); setErrors({}) }, [])
  const validate = useCallback((): z.output<S> | null => {
    const r = schema.safeParse(values)
    if (r.success) { setErrors({}); return r.data }
    const out: Record<string, string> = {}
    for (const i of r.error.issues) { const k = String(i.path[0] ?? '_'); if (!(k in out)) out[k] = i.message }
    setErrors(out)
    return null
  }, [schema, values])
  return { values, errors, set, reset, validate }
}

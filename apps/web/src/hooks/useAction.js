import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { toAppError } from '@/services/errors'

/**
 * Wraps an async handler: blocks duplicate submissions (ref lock, so double-clicks within one
 * render can't slip through), exposes `pending`, and surfaces failures as toasts (never silent).
 * The promise resolves to the result, or `undefined` on failure so callers can keep the form open.
 */
export function useAction(fn, { success, error: errMsg } = {}) {
  const lock = useRef(false)
  const [pending, setPending] = useState(false)
  const run = useCallback(async (...args) => {
    if (lock.current) return undefined
    lock.current = true
    setPending(true)
    try {
      const out = await fn(...args)
      if (success) toast.success(typeof success === 'function' ? success(out) : success)
      return out === undefined ? true : out
    } catch (e) {
      const err = toAppError(e)
      toast.error(errMsg ? `${errMsg}: ${err.message}` : err.message)
      return undefined
    } finally {
      lock.current = false
      setPending(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn])
  return [run, pending]
}

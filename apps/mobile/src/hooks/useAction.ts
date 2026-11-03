import { useCallback, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { toAppError } from '@lifetrack/data'

/** Wraps a write: tracks pending state, ignores re-entry while pending, and reports failures to the user. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { errorTitle?: string } = {}) {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (busy.current) return undefined
    busy.current = true; setPending(true)
    try { return await fn(...args) }
    catch (e) { Alert.alert(opts.errorTitle ?? 'Could not save', toAppError(e).message); return undefined }
    finally { busy.current = false; setPending(false) }
  }, [fn, opts.errorTitle])
  return [run, pending] as const
}

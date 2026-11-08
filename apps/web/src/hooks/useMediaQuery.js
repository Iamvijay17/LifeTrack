import { useSyncExternalStore } from 'react'

/** A live media query. On the first render and without `matchMedia` it answers false. */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia?.(query)
      mq?.addEventListener?.('change', notify)
      return () => mq?.removeEventListener?.('change', notify)
    },
    () => !!window.matchMedia?.(query)?.matches,
  )
}
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)')

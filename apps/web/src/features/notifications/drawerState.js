import { useSyncExternalStore } from 'react'

// Whether the notification drawer is open. It lives outside React so the bell, a toast's "Open" button and a keyboard shortcut can all open it.
let open = false
const subs = new Set()
const set = (next) => {
  if (open === next) return
  open = next
  subs.forEach((f) => f())
}
export const openNotificationDrawer = () => set(true)
export const closeNotificationDrawer = () => set(false)
export const toggleNotificationDrawer = () => set(!open)
export const useNotificationDrawerOpen = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => open,
    () => false,
  )

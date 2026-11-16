// "Install LifeTrack": the browser offers installation once (the `beforeinstallprompt` event), usually before any page has mounted, so it is
// captured here as soon as this module loads (main.jsx imports it) and kept until a component asks to show it.
import { useSyncExternalStore } from 'react'

let deferred = null
let installed = false
const subs = new Set()
const emit = () => subs.forEach((f) => f())

const standalone = () =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true)

if (typeof window !== 'undefined') {
  installed = standalone()
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button instead of the browser's mini-bar
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window)

let snap = { canInstall: false, installed, ios: false }
const compute = () => {
  const next = { canInstall: !!deferred && !installed, installed, ios: isIos() && !installed }
  if (next.canInstall !== snap.canInstall || next.installed !== snap.installed || next.ios !== snap.ios) snap = next
  return snap
}

/** { canInstall, installed, ios }: `canInstall` when the browser has an install prompt ready, `ios` when only "Add to Home Screen" is possible. */
export const useInstall = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    compute,
    () => snap,
  )

/** Shows the browser's install dialog. Resolves to 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const e = deferred
  deferred = null // an event can be used once
  emit()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome
}

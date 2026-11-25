// Imported by the generated service worker. Offline changes are kept in IndexedDB and sent by the open app, because the sign-in session lives in
// the page and is deliberately never handed to the service worker. So this only WAKES the app: when the browser says "back online" (Background
// Sync, Chromium) it tells every open LifeTrack window to send its queue. With no window open nothing is sent; the next visit sends it.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'lifetrack-sync') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      windows.forEach((w) => w.postMessage({ type: 'lifetrack-sync' }))
    }),
  )
})

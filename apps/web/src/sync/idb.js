// A very small promise wrapper over IndexedDB: one database, four key-value stores. Everything is optional: where IndexedDB is missing or
// blocked (private windows in some browsers, old WebViews, jsdom) `available()` is false and callers carry on online-only.
const NAME = 'lifetrack-offline'
const VERSION = 1
export const STORES = ['keys', 'snapshots', 'outbox', 'meta']

let opening
export const available = () => typeof indexedDB !== 'undefined' && indexedDB !== null

function open() {
  if (!available()) return Promise.reject(new Error('IndexedDB is not available'))
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION)
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        opening = undefined
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB is blocked'))
  }).catch((e) => {
    opening = undefined
    throw e
  })
  return opening
}

const run = async (store, mode, fn) => {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    let out
    Promise.resolve(fn(tx.objectStore(store))).then((v) => (out = v), reject)
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}
const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export const idb = {
  get: (store, key) => run(store, 'readonly', (s) => wrap(s.get(key))),
  put: (store, key, value) => run(store, 'readwrite', (s) => wrap(s.put(value, key))),
  del: (store, key) => run(store, 'readwrite', (s) => wrap(s.delete(key))),
  /** Every [key, value] pair. */
  entries: (store) =>
    run(store, 'readonly', async (s) => {
      const [keys, values] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())])
      return keys.map((k, i) => [k, values[i]])
    }),
  clear: (store) => run(store, 'readwrite', (s) => wrap(s.clear())),
  /** Delete every entry whose key starts with `prefix`. */
  delPrefix: (store, prefix) =>
    run(store, 'readwrite', async (s) => {
      const keys = await wrap(s.getAllKeys())
      await Promise.all(keys.filter((k) => String(k).startsWith(prefix)).map((k) => wrap(s.delete(k))))
    }),
}

/** For tests: forget the open connection so a fresh fake database is used. */
export const _reset = () => {
  opening = undefined
}

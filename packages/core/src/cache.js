// A small in-memory cache with the properties the app needs and nothing else: namespaced keys (so one person's entries can never be served to another),
// TTL, version stamps (bumping a version makes older entries invisible), tag invalidation, a size bound, single-flight loading (a stampede of identical
// requests shares one), hit/miss counters, and a stale-on-error policy that is OFF unless the caller says the data may be shown late.
// Pure: time is injectable. No I/O, no storage: nothing here survives a reload, which is the point (no stale financial data after a restart).

/** Freshness policies. `staleOnError` = may an expired entry be served when reloading fails. Money, security and anything personal says no. */
export const FRESHNESS = {
  /** Flags, labels, lookups: a minute old is fine, and an old value beats an error. */
  presentation: { ttlMs: 60_000, staleOnError: true },
  /** Lists and counts of the person's own records: short, and never served late after a failure. */
  records: { ttlMs: 15_000, staleOnError: false },
  /** Money and anything sensitive: very short, never stale. */
  sensitive: { ttlMs: 5_000, staleOnError: false },
  /** Admin dashboards: expensive to compute, fine to be half a minute old, shown as such on failure. */
  admin: { ttlMs: 30_000, staleOnError: true },
}

export function createCache({ ttlMs = 30_000, maxEntries = 200, staleOnError = false, now = () => Date.now() } = {}) {
  const entries = new Map() // key -> { value, at, ttl, tags, version }
  const inflight = new Map() // key -> Promise
  const versions = new Map() // namespace -> number
  const stats = { hits: 0, misses: 0, stale: 0, loads: 0, errors: 0, evictions: 0, invalidations: 0, coalesced: 0 }
  const ns = (key) => String(key).split('|')[0]
  const ver = (n) => versions.get(n) ?? 0

  const live = (e, key) => e && e.version === ver(ns(key)) && now() - e.at < e.ttl
  const put = (key, value, opts) => {
    entries.delete(key)
    entries.set(key, { value, at: now(), ttl: opts.ttlMs ?? ttlMs, tags: opts.tags ?? [], version: ver(ns(key)) })
    while (entries.size > maxEntries) {
      entries.delete(entries.keys().next().value) // oldest first
      stats.evictions++
    }
  }
  return {
    /** Key convention: `<namespace>|<user id>|<what>`; the namespace (first part) is what `bump` invalidates. */
    key: (namespace, userId, ...parts) =>
      [namespace, userId ?? 'anon', ...parts.map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p)))].join('|'),
    peek(key) {
      const e = entries.get(key)
      return live(e, key) ? e.value : undefined
    },
    /** Returns the cached value, or loads it (once, however many callers ask at the same time). `opts`: { ttlMs, tags, staleOnError, force } */
    async get(key, loader, opts = {}) {
      const e = entries.get(key)
      if (!opts.force && live(e, key)) {
        stats.hits++
        return e.value
      }
      if (inflight.has(key)) {
        stats.coalesced++
        return inflight.get(key)
      }
      stats.misses++
      const startVersion = ver(ns(key))
      const p = (async () => {
        stats.loads++
        try {
          const value = await loader()
          if (ver(ns(key)) === startVersion) put(key, value, opts) // a result that was loaded before an invalidation is not stored
          return value
        } catch (err) {
          stats.errors++
          if ((opts.staleOnError ?? staleOnError) && e && e.version === ver(ns(key))) {
            stats.stale++
            return e.value
          }
          throw err
        } finally {
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },
    set: (key, value, opts = {}) => put(key, value, opts),
    delete(key) {
      stats.invalidations += entries.delete(key) ? 1 : 0
    },
    /** Invalidate everything in a namespace (after a mutation of that kind of data). Loads in flight at that moment are not stored. */
    bump(namespace) {
      versions.set(namespace, ver(namespace) + 1)
      for (const [k, e] of entries) if (e.version !== ver(ns(k))) (entries.delete(k), stats.invalidations++)
    },
    invalidateTag(tag) {
      for (const [k, e] of entries) if (e.tags.includes(tag)) (entries.delete(k), stats.invalidations++)
    },
    /** Drop every entry of one person (sign-out) or everything. */
    clear(userId) {
      for (const k of [...entries.keys()]) if (userId == null || k.split('|')[1] === String(userId)) entries.delete(k)
    },
    stats: () => ({ ...stats, size: entries.size, hitRate: stats.hits + stats.misses ? stats.hits / (stats.hits + stats.misses) : null }),
  }
}

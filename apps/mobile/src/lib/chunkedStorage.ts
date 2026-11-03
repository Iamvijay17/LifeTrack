// Supabase stores the whole session JSON under one key, which can exceed SecureStore's ~2KB per-value limit.
// This adapter splits a value across several SecureStore entries and reassembles it. Pure + injectable for tests.

export interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>
  setItemAsync(key: string, value: string): Promise<void>
  deleteItemAsync(key: string): Promise<void>
}
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

// 512 chars <= 2048 bytes even if every char were 4-byte UTF-8.
const CHUNK = 512
// SecureStore keys may contain only alphanumerics, '.', '-' and '_'.
const safe = (k: string) => k.replace(/[^\w.-]/g, '_')
const countKey = (k: string) => `${safe(k)}.n`
const partKey = (k: string, i: number) => `${safe(k)}.${i}`

export function createChunkedStorage(store: KeyValueStore): AsyncStorageLike {
  const readCount = async (key: string) => {
    const raw = await store.getItemAsync(countKey(key))
    const n = raw == null ? 0 : Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : 0
  }
  const clear = async (key: string) => {
    const n = await readCount(key)
    await Promise.all([...Array.from({ length: n }, (_, i) => store.deleteItemAsync(partKey(key, i))), store.deleteItemAsync(countKey(key))])
  }
  return {
    async getItem(key) {
      const n = await readCount(key)
      if (n === 0) return null
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => store.getItemAsync(partKey(key, i))))
      if (parts.some((p) => p == null)) { await clear(key); return null } // corrupted/partial write: treat as signed out
      return parts.join('')
    },
    async setItem(key, value) {
      const prev = await readCount(key)
      const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? ['']
      // Write all parts before the count so a crash never leaves a count pointing at missing parts.
      await Promise.all(chunks.map((c, i) => store.setItemAsync(partKey(key, i), c)))
      await store.setItemAsync(countKey(key), String(chunks.length))
      await Promise.all(Array.from({ length: Math.max(0, prev - chunks.length) }, (_, i) => store.deleteItemAsync(partKey(key, chunks.length + i))))
    },
    removeItem: clear,
  }
}

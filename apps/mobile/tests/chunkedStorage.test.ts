import { describe, expect, it } from 'vitest'
import { createChunkedStorage, type KeyValueStore } from '../src/lib/chunkedStorage'

const fake = (limit = 2048) => {
  const m = new Map<string, string>()
  const s: KeyValueStore = {
    async getItemAsync(k) { return m.get(k) ?? null },
    async setItemAsync(k, v) {
      if (!/^[\w.-]+$/.test(k)) throw new Error('invalid key ' + k)
      if (new TextEncoder().encode(v).length > limit) throw new Error('value too large')
      m.set(k, v)
    },
    async deleteItemAsync(k) { m.delete(k) },
  }
  return { m, s }
}

describe('chunked secure storage', () => {
  it('round-trips a session larger than the per-value limit, including multibyte text', async () => {
    const { s } = fake()
    const st = createChunkedStorage(s)
    const big = JSON.stringify({ access_token: 'a'.repeat(3000), user: { name: 'விஜய் 😀'.repeat(200) } })
    await st.setItem('sb-abc-auth-token', big)
    expect(await st.getItem('sb-abc-auth-token')).toBe(big)
  })
  it('sanitises keys that SecureStore would reject', async () => {
    const { s } = fake()
    const st = createChunkedStorage(s)
    await st.setItem('sb:weird key/1', 'x')
    expect(await st.getItem('sb:weird key/1')).toBe('x')
  })
  it('removes stale chunks when a value shrinks and on removeItem', async () => {
    const { m, s } = fake()
    const st = createChunkedStorage(s)
    await st.setItem('k', 'x'.repeat(2000))
    expect(m.size).toBeGreaterThan(3)
    await st.setItem('k', 'short')
    expect([...m.keys()].sort()).toEqual(['k.0', 'k.n'])
    await st.removeItem('k')
    expect(m.size).toBe(0)
    expect(await st.getItem('k')).toBeNull()
  })
  it('treats a partially written / corrupted value as signed out and cleans up', async () => {
    const { m, s } = fake()
    const st = createChunkedStorage(s)
    await st.setItem('k', 'y'.repeat(2000))
    m.delete('k.1')
    expect(await st.getItem('k')).toBeNull()
    expect(m.size).toBe(0)
  })
  it('returns null for a missing key or a garbage count', async () => {
    const { m, s } = fake()
    const st = createChunkedStorage(s)
    expect(await st.getItem('none')).toBeNull()
    m.set('bad.n', 'NaN')
    expect(await st.getItem('bad')).toBeNull()
  })
})

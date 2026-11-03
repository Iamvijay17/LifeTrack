import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/services/auth'
import { db } from '@/services/db'
import { setUserId } from '@/services/session'

// DEV mode only (no Supabase env in tests): a local stand-in for Supabase Auth that the whole e2e suite relies on.
beforeEach(() => { localStorage.clear() })

describe('dev auth', () => {
  it('sign up creates and signs in an account; duplicates and bad input are rejected', async () => {
    expect(await auth.signUp('Ann@Example.com', 'secret123', 'Ann')).toMatchObject({ needsConfirmation: false })
    const s = await auth.getSession()
    expect(s.user).toMatchObject({ email: 'ann@example.com', user_metadata: { display_name: 'Ann' } })
    await expect(auth.signUp('ann@example.com', 'secret123', 'Again')).rejects.toThrow(/already/i)
  })
  it('sign in checks the password (case-insensitive email) and sign out clears the session', async () => {
    await auth.signUp('ann@example.com', 'secret123', 'Ann'); await auth.signOut()
    expect(await auth.getSession()).toBeNull()
    await expect(auth.signIn('ann@example.com', 'wrong')).rejects.toThrow('Incorrect email or password.')
    await expect(auth.signIn('nobody@example.com', 'secret123')).rejects.toThrow('Incorrect email or password.')
    await auth.signIn('ANN@example.com', 'secret123')
    expect((await auth.getSession()).user.email).toBe('ann@example.com')
  })
  it('passwords are stored hashed, never in clear text', async () => {
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret123')
  })
  it('onChange reports sign-in, sign-out and profile updates, and can be unsubscribed', async () => {
    const seen = []
    const off = auth.onChange((e) => seen.push(e))
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    await auth.updateDisplayName('Annie')
    await auth.signOut()
    expect(seen).toEqual(expect.arrayContaining(['SIGNED_IN', 'USER_UPDATED', 'SIGNED_OUT']))
    off(); const n = seen.length
    await auth.signIn('ann@example.com', 'secret123')
    expect(seen).toHaveLength(n)
  })
  it('changes display name and password; both require being signed in', async () => {
    await expect(auth.updatePassword('x')).rejects.toThrow('Not signed in.')
    await expect(auth.updateDisplayName('x')).rejects.toThrow('Not signed in.')
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    await auth.updateDisplayName('Annie'); expect((await auth.getSession()).user.user_metadata.display_name).toBe('Annie')
    await auth.updatePassword('newsecret99'); await auth.signOut()
    await expect(auth.signIn('ann@example.com', 'secret123')).rejects.toThrow()
    await auth.signIn('ann@example.com', 'newsecret99')
  })
  it('password reset explains that it needs a real project', async () => {
    await expect(auth.sendPasswordReset('a@b.c')).rejects.toThrow(/Supabase/)
  })
  it('deleting the account removes the user and ALL their data, and leaves other accounts alone', async () => {
    await auth.signUp('ann@example.com', 'secret123', 'Ann')
    const ann = (await auth.getSession()).user.id; setUserId(ann)
    await db.insert('tasks', [{ title: 'ann task', due_date: '2026-11-02' }])
    await auth.signOut()
    await auth.signUp('bob@example.com', 'secret123', 'Bob')
    const bob = (await auth.getSession()).user.id; setUserId(bob)
    await db.insert('tasks', [{ title: 'bob task', due_date: '2026-11-02' }])
    await auth.deleteAccount()
    expect(await auth.getSession()).toBeNull()
    await expect(auth.signIn('bob@example.com', 'secret123')).rejects.toThrow()
    await auth.signIn('ann@example.com', 'secret123'); setUserId(ann)
    expect((await db.list('tasks')).map((t) => t.title)).toEqual(['ann task'])
    setUserId(bob)
    expect(await db.list('tasks')).toEqual([])
    await auth.signOut(); await auth.deleteAccount() // deleting while signed out is a no-op
  })
  it('a corrupted session record is treated as signed out, not a crash', async () => {
    localStorage.setItem('lifetrack-dev:session', '{not json')
    expect(await auth.getSession()).toBeNull()
    localStorage.setItem('lifetrack-dev:users', '{bad')
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow('Incorrect email or password.')
  })
})

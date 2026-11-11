import { beforeEach, describe, expect, it } from 'vitest'
import { auth } from '@/services/auth'

const USERS = 'lifetrack-dev:users'
const users = () => JSON.parse(localStorage.getItem(USERS))
const STRONG = 'Violet-Harbor-42'

// The unsalted SHA-256 the dev backend used before: "lt:" + password.
const legacyHash = async (pw) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lt:${pw}`)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

beforeEach(() => localStorage.clear())

describe('dev backend: passwords are stored salted and slow', () => {
  it('new accounts get PBKDF2 and no plain or fast hash', async () => {
    await auth.signUp('ann@example.com', STRONG, 'Ann')
    const [u] = users()
    expect(u.pw).toMatchObject({ algo: 'pbkdf2-sha256' })
    expect(u.hash).toBeUndefined()
    expect(JSON.stringify(users())).not.toContain(STRONG)
    expect(JSON.stringify(users())).not.toContain(await legacyHash(STRONG))
  })
  it('the same password gets a different hash for each account', async () => {
    await auth.signUp('ann@example.com', STRONG, 'Ann')
    await auth.signUp('bob@example.com', STRONG, 'Bob')
    const [a, b] = users()
    expect(a.pw.hash).not.toBe(b.pw.hash)
  })
})

describe('dev backend: accounts made before keep working, and are upgraded when they sign in', () => {
  it('signs in with the old hash, then rewrites it', async () => {
    localStorage.setItem(
      USERS,
      JSON.stringify([{ id: 'u-old', email: 'old@example.com', name: 'Old', hash: await legacyHash('secret123') }]),
    )
    await expect(auth.signIn('old@example.com', 'wrong')).rejects.toThrow('Incorrect email or password.')
    expect(users()[0].hash).toBeTruthy() // a failed sign-in upgrades nothing
    await auth.signIn('old@example.com', 'secret123')
    expect(users()[0].hash).toBeUndefined()
    expect(users()[0].pw).toMatchObject({ algo: 'pbkdf2-sha256' })
    await auth.signOut()
    await auth.signIn('old@example.com', 'secret123') // and the upgraded record verifies
    expect((await auth.getSession()).user.email).toBe('old@example.com')
  })
})

describe('dev backend: repeated wrong passwords lock the account for a while', () => {
  it('locks after 5, refuses even the right password, and forgives after the wait', async () => {
    await auth.signUp('ann@example.com', STRONG, 'Ann')
    await auth.signOut()
    for (let i = 0; i < 5; i++) await expect(auth.signIn('ann@example.com', 'nope')).rejects.toThrow('Incorrect email or password.')
    await expect(auth.signIn('ann@example.com', STRONG)).rejects.toThrow(/Too many sign-in attempts. Try again in 1 min/)
    const fails = JSON.parse(localStorage.getItem('lifetrack-dev:password-failures'))
    fails['ann@example.com'].until = Date.now() - 1
    localStorage.setItem('lifetrack-dev:password-failures', JSON.stringify(fails))
    await auth.signIn('ann@example.com', STRONG)
    expect(JSON.parse(localStorage.getItem('lifetrack-dev:password-failures'))['ann@example.com']).toBeUndefined()
  })
  it('counts accounts separately', async () => {
    await auth.signUp('ann@example.com', STRONG, 'Ann')
    await auth.signUp('bob@example.com', STRONG, 'Bob')
    await auth.signOut()
    for (let i = 0; i < 5; i++) await auth.signIn('ann@example.com', 'nope').catch(() => {})
    await auth.signIn('bob@example.com', STRONG)
    expect((await auth.getSession()).user.email).toBe('bob@example.com')
  })
})

describe('dev backend: changing the password', () => {
  beforeEach(() => auth.signUp('ann@example.com', STRONG, 'Ann'))
  it('needs the current password, and a strong new one', async () => {
    await expect(auth.changePassword('wrong', 'Another-Strong-77')).rejects.toThrow('Your current password is not correct.')
    await expect(auth.changePassword(STRONG, 'password123')).rejects.toThrow(/most common/)
    await expect(auth.changePassword(STRONG, 'Ann-2031-xyz')).rejects.toThrow(/name or email/)
    await auth.signOut()
    await auth.signIn('ann@example.com', STRONG) // nothing changed
  })
  it('changes it, and the old one stops working', async () => {
    expect(await auth.changePassword(STRONG, 'Another-Strong-77')).toEqual({ othersSignedOut: true })
    await auth.signOut()
    await expect(auth.signIn('ann@example.com', STRONG)).rejects.toThrow('Incorrect email or password.')
    await auth.signIn('ann@example.com', 'Another-Strong-77')
  })
  it('counts wrong current passwords toward the lockout, like a sign-in', async () => {
    for (let i = 0; i < 5; i++) await auth.changePassword('wrong', 'Another-Strong-77').catch(() => {})
    await expect(auth.changePassword(STRONG, 'Another-Strong-77')).rejects.toThrow(/Too many sign-in attempts/)
  })
  it('needs a signed-in user', async () => {
    await auth.signOut()
    await expect(auth.changePassword(STRONG, 'Another-Strong-77')).rejects.toThrow(/Sign in again/)
  })
})

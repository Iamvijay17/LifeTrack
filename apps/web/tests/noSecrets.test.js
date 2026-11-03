import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanText, scanDir } from '../../../scripts/check-no-secrets.mjs'

const jwt = (role) => ['{"alg":"HS256"}', JSON.stringify({ role, iss: 'supabase' })].map((s) => Buffer.from(s).toString('base64url')).concat('c2lnbmF0dXJlMTIzNDU2').join('.')

describe('secret scanner', () => {
  it('flags service-role JWTs, sb_secret_ keys and assigned service keys', () => {
    expect(scanText(`const k="${jwt('service_role')}"`)).toEqual(['service_role JWT'])
    expect(scanText('x = "sb_secret_abcdefghijklmnop"')).toEqual(['sb_secret_ key'])
    expect(scanText('SUPABASE_SERVICE_ROLE_KEY="abcdefghijklmnopqrstuvwxyz"')).toHaveLength(1)
  })
  it('allows anon keys, publishable keys and mere mentions of the variable name', () => {
    expect(scanText(`const k="${jwt('anon')}"`)).toEqual([])
    expect(scanText('sb_publishable_abcdefghijklmnop')).toEqual([])
    expect(scanText('// never ship SUPABASE_SERVICE_ROLE_KEY to clients')).toEqual([])
  })
  it('finds a planted secret in nested files', () => {
    const d = mkdtempSync(join(tmpdir(), 'scan-'))
    mkdirSync(join(d, 'a/b'), { recursive: true })
    writeFileSync(join(d, 'a/b/bundle.js'), `x("${jwt('service_role')}")`)
    expect(scanDir(d)).toHaveLength(1)
  })
  it('the real client sources contain no secrets', () => {
    expect(scanDir(new URL('../src', import.meta.url).pathname)).toEqual([])
    expect(scanDir(new URL('../../mobile/app', import.meta.url).pathname)).toEqual([])
    expect(scanDir(new URL('../../mobile/src', import.meta.url).pathname)).toEqual([])
  })
})

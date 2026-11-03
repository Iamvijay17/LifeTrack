import { beforeEach, describe, expect, it } from 'vitest'
import { isPublicPath, needsSession, pathFromUrl, peekPending, rememberPending, takePending, webLinkToRoute } from '../src/lib/deepLinks'

describe('webLinkToRoute (notification.link → mobile route)', () => {
  it('tab pages keep their path; modules move under /module; unknown → dashboard', () => {
    expect(['/planner', '/habits', '/finance', '/'].map(webLinkToRoute)).toEqual(['/planner', '/habits', '/finance', '/'])
    expect(['/learning', '/fitness', '/jobs', '/health', '/focus', '/notes', '/goals', '/analytics', '/settings', '/notifications'].map(webLinkToRoute))
      .toEqual(['/module/learning', '/module/fitness', '/module/jobs', '/module/health', '/module/focus', '/module/notes', '/module/goals', '/module/analytics', '/module/settings', '/module/notifications'])
    expect(['', null, undefined, '/nope', '/module/nope', 'javascript:alert(1)', '//evil.com/x'].map(webLinkToRoute)).toEqual(['/', '/', '/', '/', '/', '/', '/'])
  })
  it('tolerates query strings, trailing slashes, absolute URLs and pages without a mobile screen', () => {
    expect(webLinkToRoute('/learning?tab=goals')).toBe('/module/learning')
    expect(webLinkToRoute('/finance/')).toBe('/finance')
    expect(webLinkToRoute('https://lifetrack.app/habits#x')).toBe('/habits')
    expect(webLinkToRoute('/reports')).toBe('/module/analytics')
    expect(webLinkToRoute('/module/jobs')).toBe('/module/jobs')
  })
})
describe('pathFromUrl', () => {
  it('custom scheme, https, dev-client wrapper and plain paths', () => {
    expect(pathFromUrl('lifetrack://planner')).toBe('/planner')
    expect(pathFromUrl('lifetrack://module/jobs?x=1')).toBe('/module/jobs')
    expect(pathFromUrl('lifetrack://')).toBe('/')
    expect(pathFromUrl('lifetrack://reset-password?code=abc')).toBe('/reset-password')
    expect(pathFromUrl('https://lifetrack.app/finance')).toBe('/finance')
    expect(pathFromUrl('exp+lifetrack://expo-development-client/?url=x')).toBe('/') // dev-client launcher link: not an app destination
    expect(pathFromUrl('exp://192.168.1.2:8081/--/planner')).toBe('/planner')
    expect(pathFromUrl('/habits?a=1')).toBe('/habits')
    expect(pathFromUrl('')).toBeNull()
    expect(pathFromUrl(null)).toBeNull()
    expect(pathFromUrl('not a url')).toBeNull()
  })
})
describe('sign-in gating', () => {
  beforeEach(() => { takePending() })
  it('knows which paths are public', () => {
    expect(['/sign-in', '/auth-callback', '/reset-password'].every(isPublicPath)).toBe(true)
    expect(['/planner', '/module/jobs', '/'].some(isPublicPath)).toBe(false)
    expect(needsSession('/module/jobs')).toBe(true)
    expect(needsSession('/')).toBe(false)
    expect(needsSession('/sign-in')).toBe(false)
    expect(needsSession(null)).toBe(false)
  })
  it('remembers a protected target once and hands it out exactly once', () => {
    rememberPending('/module/jobs')
    expect(peekPending()).toBe('/module/jobs')
    expect(takePending()).toBe('/module/jobs')
    expect(takePending()).toBeNull()
  })
  it('never remembers public or empty targets', () => {
    rememberPending('/sign-in'); rememberPending('/'); rememberPending(null)
    expect(peekPending()).toBeNull()
  })
})

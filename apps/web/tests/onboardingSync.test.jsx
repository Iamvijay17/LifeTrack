import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

const remote = vi.hoisted(() => ({ value: {} }))
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: { onboarding_state: remote.value },
    row: { defaults_seeded: true, onboarding_state: remote.value },
    loading: false,
  }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-sync' } }) }))
vi.mock('@/services/db', () => ({ db: { upsert: vi.fn(async () => []) } }))
vi.mock('@/hooks/store', () => ({ patch: vi.fn(), tracked: (f) => f() }))

const { useOnboarding, useOnboardingSync, updateOnboarding, putOffOnboarding } = await import('@/hooks/useOnboarding')

function Probe() {
  useOnboardingSync()
  return <output>{useOnboarding().status ?? 'none'}</output>
}

describe('onboarding sync: the newer copy wins', () => {
  beforeEach(() => {
    localStorage.clear()
    remote.value = {}
  })
  it('keeps a choice made on this device that the account has not received yet', () => {
    // The account still holds an older "in progress" copy (a save that had not finished when the page was reloaded).
    remote.value = { status: 'in_progress', step: 1, at: 1000 }
    const { getByRole } = render(<Probe />)
    act(() => putOffOnboarding())
    expect(getByRole('status')).toHaveTextContent('later')
    // Same page, reloaded: the account's older copy is read again and must not win.
    const again = render(<Probe />)
    expect(again.getAllByRole('status').at(-1)).toHaveTextContent('later')
  })
  it('adopts a newer copy from another device', () => {
    remote.value = { status: 'in_progress', step: 1, at: 1000 }
    render(<Probe />)
    act(() => updateOnboarding({ status: 'later' }))
    remote.value = { status: 'done', step: 0, at: Date.now() + 60_000 }
    const r = render(<Probe />)
    expect(r.getAllByRole('status').at(-1)).toHaveTextContent('done')
  })
})

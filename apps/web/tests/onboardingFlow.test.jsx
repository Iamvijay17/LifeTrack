import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const save = vi.fn(async () => {})
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: { habit_prefs: {} }, row: null, loading: false, save }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: '' }) }))
vi.mock('@/services/auth', () => ({ auth: { updateDisplayName: vi.fn(async () => {}) } }))
vi.mock('@/services/db', () => ({ db: { upsert: vi.fn(async () => []) } }))
vi.mock('@/hooks/store', () => ({ patch: vi.fn(), tracked: (f) => f() }))

const { OnboardingFlow } = await import('@/features/onboarding/OnboardingFlow')
const { SetupCard } = await import('@/features/settings/SetupCard')
const { TourProvider } = await import('@/features/tour/TourProvider')
const { updateOnboarding, putOffOnboarding, restartTour } = await import('@/hooks/useOnboarding')

const app = () =>
  render(
    <MemoryRouter>
      <TourProvider>
        <OnboardingFlow />
        <SetupCard />
      </TourProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  save.mockClear()
  act(() => updateOnboarding({ status: 'in_progress', step: 0, answers: {}, tours: {}, offered: {} }))
})

describe('OnboardingFlow', () => {
  it('walks forward and back, shows progress, and lets optional steps be skipped', async () => {
    const user = userEvent.setup()
    app()
    expect(await screen.findByText('Welcome to LifeTrack')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument() // welcome is not optional
    await user.click(screen.getByRole('button', { name: /get started/i }))
    expect(screen.getByText('About you')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByText('What do you want to track?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('About you')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toBeInTheDocument()
  })

  it('"Do this later" keeps the answers and the step, and Settings can resume from there', async () => {
    const user = userEvent.setup()
    app()
    await user.click(await screen.findByRole('button', { name: /get started/i }))
    await user.type(screen.getByLabelText('What should we call you?'), 'Sam')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: /do this later/i }))
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
    expect(screen.getByText(/not finished/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /continue setup/i }))
    expect(await screen.findByText('What do you want to track?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByLabelText('What should we call you?')).toHaveValue('Sam')
  })

  it('finishing writes only the answered fields', async () => {
    const user = userEvent.setup()
    app()
    await user.click(await screen.findByRole('button', { name: /get started/i }))
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Skip' })) // profile, modules, learning
    await user.type(screen.getByLabelText(/water goal/i), '2500')
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: i === 0 ? 'Next' : 'Skip' }))
    expect(screen.getByText('All set')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /finish setup/i }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({ water_goal_ml: 2500 })
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  })
})

describe('SetupCard and tours', () => {
  it('lists the tours, starts one, records completion and can reset it', async () => {
    const user = userEvent.setup()
    act(() => putOffOnboarding())
    app()
    await user.click(screen.getAllByRole('button', { name: 'Start' })[0])
    expect(await screen.findByTestId('tour')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.queryByTestId('tour')).not.toBeInTheDocument()
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reset dashboard tour/i }))
    expect(screen.queryByText('Skipped')).not.toBeInTheDocument()
    act(() => restartTour('dashboard'))
  })
})

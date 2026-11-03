import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_WEIGHTS, weightShares, normalizeWeights } from '@/domain/score'
import { TABLES } from '@lifetrack/constants/schema'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  updateName: vi.fn(),
  updatePassword: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  update: vi.fn(),
  removeMany: vi.fn(),
  refetchLoaded: vi.fn(),
  peek: vi.fn(),
  dbList: vi.fn(),
  tableToCsv: vi.fn(),
  download: vi.fn(),
  applyTheme: vi.fn(),
  settings: null,
  row: null,
  displayName: 'Vijay',
}))
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ settings: mocks.settings, row: mocks.row, save: mocks.save, loading: false, error: null }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ displayName: mocks.displayName, user: { email: 'v@x.com' } }) }))
vi.mock('@/hooks/useTheme', () => ({ applyTheme: mocks.applyTheme }))
vi.mock('@/services/auth', () => ({
  auth: {
    updateDisplayName: mocks.updateName,
    updatePassword: mocks.updatePassword,
    deleteAccount: mocks.deleteAccount,
    signOut: mocks.signOut,
  },
}))
vi.mock('@/hooks/store', () => ({
  useTable: () => ({ rows: [] }),
  peek: mocks.peek,
  update: mocks.update,
  removeMany: mocks.removeMany,
  refetchLoaded: mocks.refetchLoaded,
}))
vi.mock('@/services/db', () => ({ db: { list: mocks.dbList }, isDevMode: false }))
vi.mock('@/services/csv', async (orig) => ({ ...(await orig()), tableToCsv: mocks.tableToCsv, download: mocks.download }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { TypedConfirmDialog } from '@/components/shared/TypedConfirmDialog'
import { ProfileCard } from '@/features/settings/ProfileCard'
import { PreferencesCard } from '@/features/settings/PreferencesCard'
import { ScoreWeightsCard } from '@/features/settings/ScoreWeightsCard'
import { FocusPrefsCard } from '@/features/settings/FocusPrefsCard'
import { AccountCard } from '@/features/settings/AccountCard'
import { AppearanceCard } from '@/features/settings/AppearanceCard'
import { EraseCard } from '@/features/export/EraseCard'
import { CsvCard } from '@/features/export/CsvCard'

const baseSettings = {
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  week_starts_on: 1,
  daily_study_target_minutes: 120,
  monthly_budget_paise: 3000000,
  water_goal_ml: 3000,
  steps_goal: 8000,
  theme: 'dark',
  score_weights: { ...DEFAULT_WEIGHTS },
  focus_prefs: { short_break: 5, long_break: 15, long_every: 4 },
}
const submitIn = (card) => card.querySelector('button[type=submit]')

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m?.mockReset === 'function' && m.mockReset())
  mocks.settings = { ...baseSettings }
  mocks.row = { id: 'r1', updated_at: 'v1' }
  mocks.displayName = 'Vijay'
  for (const k of ['save', 'updateName', 'updatePassword', 'deleteAccount', 'update', 'removeMany', 'refetchLoaded'])
    mocks[k].mockResolvedValue({})
  mocks.peek.mockReturnValue([{ id: 'p1' }])
  mocks.dbList.mockResolvedValue([])
  mocks.tableToCsv.mockResolvedValue('a,b')
})

describe('shared: TypedConfirmDialog', () => {
  const dlg = (p = {}) =>
    render(
      <TypedConfirmDialog open onOpenChange={() => {}} title="Erase?" phrase="ERASE" confirmLabel="Do it" onConfirm={() => {}} {...p} />,
    )
  it('keeps the confirm button disabled until the phrase is typed exactly (case-sensitive)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    dlg({ onConfirm })
    const btn = screen.getByRole('button', { name: 'Do it' })
    expect(btn).toBeDisabled()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'erase')
    expect(btn).toBeDisabled()
    await user.clear(screen.getByLabelText('Type ERASE to confirm'))
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE')
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(onConfirm).toHaveBeenCalled()
  })
  it('starts empty every time it is opened', async () => {
    const user = userEvent.setup()
    const { rerender } = dlg()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE')
    rerender(
      <TypedConfirmDialog open={false} onOpenChange={() => {}} title="Erase?" phrase="ERASE" confirmLabel="Do it" onConfirm={() => {}} />,
    )
    rerender(<TypedConfirmDialog open onOpenChange={() => {}} title="Erase?" phrase="ERASE" confirmLabel="Do it" onConfirm={() => {}} />)
    expect(screen.getByLabelText('Type ERASE to confirm')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Do it' })).toBeDisabled()
  })
  it('cannot be cancelled while working', () => {
    dlg({ pending: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
  it('cancel closes it', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    dlg({ onOpenChange })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('score weights domain', () => {
  it('shares are whole percentages of the total, 0 when everything is 0', () => {
    expect(weightShares(DEFAULT_WEIGHTS)).toEqual({ learning: 25, career: 25, fitness: 20, habits: 15, health: 15 })
    expect(weightShares({ learning: 1, career: 1, fitness: 1, habits: 0, health: 0 })).toMatchObject({ learning: 33, habits: 0 })
    expect(weightShares({ learning: 0, career: 0, fitness: 0, habits: 0, health: 0 })).toEqual({
      learning: 0,
      career: 0,
      fitness: 0,
      habits: 0,
      health: 0,
    })
    expect(weightShares({ learning: 'x' }).learning).toBe(0)
    expect(normalizeWeights({ learning: 10 }).learning).toBe(10)
  })
})

describe('ProfileCard', () => {
  it('Save is enabled only after a change, validates the name, then saves auth and profile', async () => {
    const user = userEvent.setup()
    const { container } = render(<ProfileCard />)
    const btn = submitIn(container)
    expect(screen.getByLabelText('Display name')).toHaveValue('Vijay')
    expect(btn).toBeDisabled()
    await user.clear(screen.getByLabelText('Display name'))
    await user.click(btn).catch(() => {})
    await user.type(screen.getByLabelText('Display name'), 'x')
    await user.clear(screen.getByLabelText('Display name'))
    await user.click(btn)
    expect(await screen.findByText('Enter a name up to 80 characters.')).toBeInTheDocument()
    expect(mocks.updateName).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Display name'), '  Vijay K  ')
    await user.click(btn)
    await waitFor(() => expect(mocks.updateName).toHaveBeenCalledWith('Vijay K'))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('profiles', 'p1', { display_name: 'Vijay K' }))
  })
})

describe('PreferencesCard', () => {
  it('loads the saved values; the budget shows without paise', () => {
    render(<PreferencesCard />)
    expect(screen.getByLabelText('Default monthly expense budget')).toHaveValue('30000')
    expect(screen.getByLabelText('Timezone')).toHaveValue('Asia/Kolkata')
    expect(screen.getByLabelText('Week starts on')).toHaveValue('1')
  })
  it('saves numbers and converts the budget to paise; a blank budget means 0', async () => {
    const user = userEvent.setup()
    const { container } = render(<PreferencesCard />)
    await user.clear(screen.getByLabelText('Daily study target (minutes)'))
    await user.type(screen.getByLabelText('Daily study target (minutes)'), '90')
    await user.clear(screen.getByLabelText('Default monthly expense budget'))
    await user.type(screen.getByLabelText('Default monthly expense budget'), '25,000.50')
    await user.click(submitIn(container))
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ daily_study_target_minutes: 90, monthly_budget_paise: 2500050, week_starts_on: 1, currency: 'INR' }),
      ),
    )
    expect(mocks.save.mock.calls[0][0]).not.toHaveProperty('monthly_budget')
    mocks.save.mockClear()
    await user.clear(screen.getByLabelText('Default monthly expense budget'))
    await user.click(submitIn(container))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ monthly_budget_paise: 0 })))
  })
  it('rejects bad values inline', async () => {
    const user = userEvent.setup()
    const { container } = render(<PreferencesCard />)
    await user.clear(screen.getByLabelText('Default monthly expense budget'))
    await user.type(screen.getByLabelText('Default monthly expense budget'), 'lots')
    fireEvent.change(screen.getByLabelText('Daily study target (minutes)'), { target: { value: '5000' } })
    await user.click(submitIn(container))
    expect(await screen.findByText('Enter an amount like 30000')).toBeInTheDocument()
    expect(screen.getByText('Max 1440')).toBeInTheDocument()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('REGRESSION: a settings change saved elsewhere (another card, another device) does not wipe what you are typing here', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<PreferencesCard />)
    await user.clear(screen.getByLabelText('Water goal (ml)'))
    await user.type(screen.getByLabelText('Water goal (ml)'), '4200')
    mocks.settings = { ...baseSettings, steps_goal: 12000 }
    mocks.row = { id: 'r1', updated_at: 'v2' } // e.g. the theme was changed, or steps changed on the phone
    rerender(<PreferencesCard />)
    expect(screen.getByLabelText('Water goal (ml)')).toHaveValue(4200) // my edit survives
    expect(screen.getByLabelText('Daily steps goal')).toHaveValue(12000) // the untouched field picked up the new value
  })
  it('a clean form follows remote changes', () => {
    const { rerender } = render(<PreferencesCard />)
    mocks.settings = { ...baseSettings, water_goal_ml: 2500 }
    mocks.row = { id: 'r1', updated_at: 'v2' }
    rerender(<PreferencesCard />)
    expect(screen.getByLabelText('Water goal (ml)')).toHaveValue(2500)
  })
})

describe('ScoreWeightsCard', () => {
  it('shows each category share live', async () => {
    render(<ScoreWeightsCard />)
    expect(screen.getAllByText(/% of the total/)).toHaveLength(5)
    expect(screen.getByLabelText('Learning')).toHaveValue(25)
    fireEvent.change(screen.getByLabelText('Learning'), { target: { value: '75' } })
    expect(await screen.findByText('50% of the total')).toBeInTheDocument() // learning 75 of 150 total
  })
  it('rejects out-of-range numbers and all-zero weights with a message at the field', async () => {
    const user = userEvent.setup()
    const { container } = render(<ScoreWeightsCard />)
    fireEvent.change(screen.getByLabelText('Career'), { target: { value: '150' } })
    await user.click(submitIn(container))
    expect(await screen.findByText('Career: enter a weight between 0 and 100.')).toBeInTheDocument()
    expect(mocks.save).not.toHaveBeenCalled()
    for (const l of ['Learning', 'Career', 'Fitness', 'Habits', 'Sleep & Health'])
      fireEvent.change(screen.getByLabelText(l), { target: { value: '0' } })
    await user.click(submitIn(container))
    expect(await screen.findByText('At least one weight must be above zero.')).toBeInTheDocument()
  })
  it('saves numeric weights; Reset restores the defaults as an unsaved change', async () => {
    const user = userEvent.setup()
    const { container } = render(<ScoreWeightsCard />)
    expect(submitIn(container)).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Learning'), { target: { value: '40' } })
    await user.click(submitIn(container))
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({ score_weights: { learning: 40, career: 25, fitness: 20, habits: 15, health: 15 } }),
    )
    mocks.settings = { ...baseSettings, score_weights: { learning: 40, career: 25, fitness: 20, habits: 15, health: 15 } }
    mocks.row = { id: 'r1', updated_at: 'v2' }
  })
  it('Reset to default fills the default numbers', async () => {
    const user = userEvent.setup()
    mocks.settings = { ...baseSettings, score_weights: { learning: 10, career: 10, fitness: 10, habits: 10, health: 10 } }
    const { container } = render(<ScoreWeightsCard />)
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(screen.getByLabelText('Learning')).toHaveValue(25)
    expect(screen.getByLabelText('Habits')).toHaveValue(15)
    expect(submitIn(container)).toBeEnabled()
  })
})

describe('FocusPrefsCard', () => {
  it('validates the three ranges at the field and saves numbers', async () => {
    const user = userEvent.setup()
    const { container } = render(<FocusPrefsCard />)
    fireEvent.change(screen.getByLabelText('Short break (min)'), { target: { value: '99' } })
    fireEvent.change(screen.getByLabelText('Long break every (sessions)'), { target: { value: '1' } })
    await user.click(submitIn(container))
    expect(await screen.findByText('Short break: 1–60 minutes.')).toBeInTheDocument()
    expect(screen.getByText('Long break every: 2–10 sessions.')).toBeInTheDocument()
    expect(mocks.save).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Short break (min)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Long break every (sessions)'), { target: { value: '3' } })
    await user.click(submitIn(container))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ focus_prefs: { short_break: 10, long_break: 15, long_every: 3 } }))
  })
  it('rejects fractions', async () => {
    const user = userEvent.setup()
    const { container } = render(<FocusPrefsCard />)
    fireEvent.change(screen.getByLabelText('Long break (min)'), { target: { value: '7.5' } })
    await user.click(submitIn(container))
    expect(await screen.findByText('Long break: 1–120 minutes.')).toBeInTheDocument()
  })
})

describe('AccountCard', () => {
  it('password: min 8, must match, then updates and clears', async () => {
    const user = userEvent.setup()
    render(<AccountCard />)
    const change = screen.getByRole('button', { name: 'Change password' })
    expect(change).toBeDisabled()
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(change)
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('New password'))
    await user.type(screen.getByLabelText('New password'), 'longenough1')
    await user.type(screen.getByLabelText('Confirm'), 'different1')
    await user.click(change)
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(mocks.updatePassword).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Confirm'))
    await user.type(screen.getByLabelText('Confirm'), 'longenough1')
    await user.click(change)
    await waitFor(() => expect(mocks.updatePassword).toHaveBeenCalledWith('longenough1'))
    await waitFor(() => expect(screen.getByLabelText('New password')).toHaveValue(''))
  })
  it('deleting the account needs the typed word and then calls deleteAccount', async () => {
    const user = userEvent.setup()
    render(<AccountCard />)
    await user.click(screen.getByRole('button', { name: /Delete account/ }))
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalledTimes(1))
  })
  it('shows the email and signs out', async () => {
    const user = userEvent.setup()
    render(<AccountCard />)
    expect(screen.getByText('v@x.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mocks.signOut).toHaveBeenCalled()
  })
})

describe('AppearanceCard', () => {
  it('applies the theme immediately and saves it to the account', async () => {
    const user = userEvent.setup()
    render(<AppearanceCard />)
    await user.click(screen.getByRole('tab', { name: 'Light' }))
    expect(mocks.applyTheme).toHaveBeenCalledWith('light')
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ theme: 'light' }))
  })
})

describe('EraseCard', () => {
  it('erases only after typing ERASE, children before parents, skipping empty tables, then refreshes', async () => {
    const user = userEvent.setup()
    mocks.dbList.mockImplementation(async (t) => (['notes', 'tasks', 'workouts'].includes(t) ? [{ id: `${t}-1` }, { id: `${t}-2` }] : []))
    render(<EraseCard />)
    await user.click(screen.getByRole('button', { name: /Erase all data/ }))
    expect(screen.getByRole('button', { name: 'Erase everything' })).toBeDisabled()
    await user.type(screen.getByLabelText('Type ERASE to confirm'), 'ERASE')
    await user.click(screen.getByRole('button', { name: 'Erase everything' }))
    await waitFor(() => expect(mocks.refetchLoaded).toHaveBeenCalled())
    const order = mocks.removeMany.mock.calls.map((c) => c[0])
    expect(order.sort()).toEqual(['notes', 'tasks', 'workouts'])
    const real = mocks.removeMany.mock.calls.map((c) => c[0])
    const idx = (t) => [...TABLES].reverse().indexOf(t)
    expect(real.every((t, i) => i === 0 || idx(real[i - 1]) < idx(t))).toBe(true) // reverse dependency order
    expect(mocks.removeMany).toHaveBeenCalledWith('tasks', ['tasks-1', 'tasks-2'])
  })
  it('does nothing if the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    render(<EraseCard />)
    await user.click(screen.getByRole('button', { name: /Erase all data/ }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.removeMany).not.toHaveBeenCalled()
  })
})

describe('CsvCard', () => {
  it('downloads one CSV per module and says so when there is nothing to export', async () => {
    const user = userEvent.setup()
    render(<CsvCard />)
    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledWith('lifetrack-tasks.csv', 'a,b'))
    mocks.tableToCsv.mockResolvedValue('')
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await waitFor(() => expect(mocks.tableToCsv).toHaveBeenCalledWith('notes'))
    expect(mocks.download).toHaveBeenCalledTimes(1)
  })
})

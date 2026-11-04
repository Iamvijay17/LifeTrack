import '@testing-library/jest-dom/vitest'
import { pickTime } from './pickers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { logToForm, formToLog, healthWeek, averageSleep, weightSeries, percentOfGoal, recentLogs } from '@/domain/health'
import { numberInRange, optionalTime } from '@/lib/validation'

const mocks = vi.hoisted(() => ({ remove: vi.fn(), saveHealth: vi.fn(), addWater: vi.fn(), confirm: vi.fn(), rows: [] }))
vi.mock('@/hooks/store', () => ({ remove: mocks.remove, useTable: () => ({ rows: mocks.rows }) }))
vi.mock('@/services/api', () => ({ saveHealth: mocks.saveHealth, addWater: mocks.addWater }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/hooks/useSettings', () => ({ useSettings: () => ({ settings: { water_goal_ml: 3000 } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { DailyLogForm } from '@/features/health/DailyLogForm'
import { WaterDialog } from '@/features/health/WaterDialog'
import { HealthStats } from '@/features/health/HealthStats'
import { HealthHistory, describeLog } from '@/features/health/HealthHistory'

const DAY = '2026-11-02'
const H = (o) => ({
  id: 'h1',
  log_date: DAY,
  bedtime: '23:30:00',
  wake_time: '06:30:00',
  sleep_minutes: 420,
  water_ml: 1000,
  steps: 4000,
  energy_level: 3,
  weight_kg: '80.5',
  notes: 'ok',
  updated_at: '2026-11-02T08:00:00Z',
  ...o,
})

beforeEach(() => {
  mocks.remove.mockReset()
  mocks.saveHealth.mockReset()
  mocks.addWater.mockReset()
  mocks.confirm.mockReset()
  mocks.rows = []
  mocks.remove.mockResolvedValue(undefined)
  mocks.saveHealth.mockResolvedValue({})
  mocks.addWater.mockResolvedValue({})
})

describe('health domain', () => {
  it('log <-> form: times lose seconds, blanks stay blank, sleep minutes are derived (overnight handled)', () => {
    expect(logToForm(H())).toEqual({
      bedtime: '23:30',
      wake_time: '06:30',
      water_ml: '1000',
      steps: '4000',
      energy_level: '3',
      weight_kg: '80.5',
      notes: 'ok',
    })
    expect(logToForm(null)).toEqual({ bedtime: '', wake_time: '', water_ml: '', steps: '', energy_level: '', weight_kg: '', notes: '' })
    const out = formToLog({ bedtime: '23:30', wake_time: '06:30', water_ml: '', steps: '', energy_level: '', weight_kg: '', notes: '' })
    expect(out).toEqual({
      bedtime: '23:30',
      wake_time: '06:30',
      sleep_minutes: 420,
      water_ml: 0,
      steps: 0,
      energy_level: null,
      weight_kg: null,
      notes: '',
    })
    expect(
      formToLog({ bedtime: '', wake_time: '', water_ml: '250', steps: '10', energy_level: '4', weight_kg: '79.9', notes: '' }),
    ).toMatchObject({ bedtime: null, wake_time: null, sleep_minutes: null, water_ml: 250, energy_level: 4, weight_kg: 79.9 })
  })
  it('the 7-day series has one row per day ending today; unlogged days are null, not 0', () => {
    const w = healthWeek(
      [H({ sleep_minutes: 450 }), H({ id: 'x', log_date: '2026-10-31', sleep_minutes: null, water_ml: 0, steps: 0 })],
      DAY,
    )
    expect(w).toHaveLength(7)
    expect(w[6]).toMatchObject({ d: DAY, sleep: 7.5, water: 1000, steps: 4000 })
    expect(w[4]).toMatchObject({ d: '2026-10-31', sleep: null, water: null, steps: null })
    expect(w[0].sleep).toBeNull()
  })
  it('average sleep counts only nights that were logged', () => {
    expect(averageSleep([{ sleep: 7 }, { sleep: null }, { sleep: 8 }])).toEqual({ minutes: 450, nights: 2 })
    expect(averageSleep([{ sleep: null }])).toEqual({ minutes: null, nights: 0 })
  })
  it('weight series: first, latest, change (string weights from the DB are numbers), and a capped chart', () => {
    const logs = [
      H({ id: 'a', log_date: '2026-10-01', weight_kg: '82' }),
      H({ id: 'b', log_date: '2026-11-01', weight_kg: '80.5' }),
      H({ id: 'c', log_date: '2026-10-15', weight_kg: null }),
    ]
    const s = weightSeries(logs)
    expect(s.first.id).toBe('a')
    expect(s.latest.id).toBe('b')
    expect(s.change).toBeCloseTo(-1.5)
    expect(s.data.map((d) => d.kg)).toEqual([82, 80.5])
    expect(weightSeries([logs[0]]).change).toBeNull()
    expect(weightSeries([])).toMatchObject({ first: null, latest: null, data: [] })
    const many = Array.from({ length: 50 }, (_, i) =>
      H({ id: String(i), log_date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10), weight_kg: String(70 + i) }),
    )
    expect(weightSeries(many, 30).data).toHaveLength(30)
  })
  it('percentOfGoal is null without a goal (not 0%), and tolerates a missing value', () => {
    expect(percentOfGoal(1500, 3000)).toBe(50)
    expect(percentOfGoal(undefined, 3000)).toBe(0)
    expect(percentOfGoal(100, 0)).toBeNull()
    expect(percentOfGoal(100, undefined)).toBeNull()
  })
  it('recent logs are newest first and capped', () => {
    const logs = Array.from({ length: 20 }, (_, i) => H({ id: String(i), log_date: `2026-10-${String(i + 1).padStart(2, '0')}` }))
    const r = recentLogs(logs)
    expect(r).toHaveLength(14)
    expect(r[0].log_date).toBe('2026-10-20')
  })
  it('validators accept blanks and enforce ranges', () => {
    expect(optionalTime.safeParse('').success).toBe(true)
    expect(optionalTime.safeParse('7:5').success).toBe(false)
    const w = numberInRange(20, 500, 'Weight')
    expect([w.safeParse('').success, w.safeParse('80.5').success, w.safeParse('5').success, w.safeParse('abc').success]).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})

describe('DailyLogForm', () => {
  const form = (p = {}) => render(<DailyLogForm day={DAY} today={DAY} log={undefined} onDayChange={() => {}} {...p} />)
  const submit = () => document.querySelector('form button[type=submit]')

  it('shows the live sleep duration for an overnight sleep', async () => {
    const user = userEvent.setup()
    form()
    await pickTime(user, screen.getByLabelText('Bedtime'), '23:30')
    await pickTime(user, screen.getByLabelText('Wake-up'), '06:30')
    expect(await screen.findByTestId('sleep-duration')).toHaveTextContent('7h')
    expect(user).toBeTruthy()
  })
  it('requires both times together and rejects identical ones', async () => {
    const user = userEvent.setup()
    form()
    await pickTime(user, screen.getByLabelText('Bedtime'), '23:00')
    await user.click(submit())
    expect(await screen.findByText('Enter both bedtime and wake-up time')).toBeInTheDocument()
    expect(mocks.saveHealth).not.toHaveBeenCalled()
    await pickTime(user, screen.getByLabelText('Wake-up'), '23:00')
    await user.click(submit())
    expect(await screen.findByText('Bedtime and wake-up time can’t be identical')).toBeInTheDocument()
  })
  it('validates ranges inline', async () => {
    const user = userEvent.setup()
    form()
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Water (ml)'), { target: { value: '999999' } })
    await user.click(submit())
    expect(await screen.findByText('Weight: 20–500')).toBeInTheDocument()
    expect(screen.getByText('Water: 0–20000')).toBeInTheDocument()
  })
  it('saves the converted record under the shown day', async () => {
    const user = userEvent.setup()
    form()
    await user.type(screen.getByLabelText('Water (ml)'), '500')
    await user.click(screen.getByRole('button', { name: 'Energy 4' }))
    await user.click(submit())
    await waitFor(() =>
      expect(mocks.saveHealth).toHaveBeenCalledWith(
        DAY,
        expect.objectContaining({ water_ml: 500, steps: 0, energy_level: 4, sleep_minutes: null }),
      ),
    )
  })
  it('an existing log loads, starts clean (button disabled) and offers Delete with a date in the prompt', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(true)
    form({ log: H() })
    expect(screen.getByLabelText('Steps')).toHaveValue(4000)
    expect(screen.getByRole('button', { name: 'Update log' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('health_logs', 'h1'))
    expect(mocks.confirm.mock.calls[0][0].title).toBe('Delete the log for 2 Nov?')
  })
  it('after saving the form is clean again', async () => {
    const user = userEvent.setup()
    form({ log: H() })
    await user.type(screen.getByLabelText('Notes'), ' more')
    expect(screen.getByRole('button', { name: 'Update log' })).toBeEnabled()
    await user.click(submit())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update log' })).toBeDisabled())
  })
  it('a change from elsewhere (water logged on the phone) updates untouched fields but NEVER overwrites what you are typing', async () => {
    const user = userEvent.setup()
    const { rerender } = form({ log: H({ water_ml: 1000 }) })
    await user.type(screen.getByLabelText('Notes'), ' + typing now')
    rerender(<DailyLogForm day={DAY} today={DAY} log={H({ water_ml: 1750, updated_at: '2026-11-02T09:00:00Z' })} onDayChange={() => {}} />)
    expect(screen.getByLabelText('Notes')).toHaveValue('ok + typing now') // my edit kept
    expect(screen.getByLabelText('Water (ml)')).toHaveValue(1750) // the untouched field picked up the new total
  })
  it('does not silently keep a stale value for a field you did edit — your text wins until you save or discard', async () => {
    const user = userEvent.setup()
    const { rerender } = form({ log: H({ water_ml: 1000 }) })
    await user.clear(screen.getByLabelText('Water (ml)'))
    await user.type(screen.getByLabelText('Water (ml)'), '1200')
    rerender(<DailyLogForm day={DAY} today={DAY} log={H({ water_ml: 1750, updated_at: '2026-11-02T09:00:00Z' })} onDayChange={() => {}} />)
    expect(screen.getByLabelText('Water (ml)')).toHaveValue(1200)
  })
  it('a clean form simply follows the remote update', () => {
    const { rerender } = form({ log: H({ steps: 4000 }) })
    rerender(<DailyLogForm day={DAY} today={DAY} log={H({ steps: 9000, updated_at: '2026-11-02T09:00:00Z' })} onDayChange={() => {}} />)
    expect(screen.getByLabelText('Steps')).toHaveValue(9000)
  })
  it('switching day replaces the form even if you had unsaved text', () => {
    const { rerender } = form({ log: H() })
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'unsaved' } })
    rerender(
      <DailyLogForm day="2026-11-03" today={DAY} log={H({ id: 'h2', log_date: '2026-11-03', notes: 'tomorrow' })} onDayChange={() => {}} />,
    )
    expect(screen.getByLabelText('Notes')).toHaveValue('tomorrow')
  })
})

describe('WaterDialog', () => {
  const open = () => render(<WaterDialog open onOpenChange={() => {}} date={DAY} />)
  it('preset buttons add that amount to the given day', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: '500' }))
    await waitFor(() => expect(mocks.addWater).toHaveBeenCalledWith(DAY, 500))
  })
  it('custom amounts are limited to 1–5000 ml and the field clears after adding', async () => {
    const user = userEvent.setup()
    open()
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Custom amount in ml'), '6000')
    expect(add).toBeDisabled()
    await user.clear(screen.getByLabelText('Custom amount in ml'))
    await user.type(screen.getByLabelText('Custom amount in ml'), '330')
    await user.click(add)
    await waitFor(() => expect(mocks.addWater).toHaveBeenCalledWith(DAY, 330))
    await waitFor(() => expect(screen.getByLabelText('Custom amount in ml')).toHaveValue(null))
  })
  it('shows progress against the goal and offers Undo only when there is water to undo', async () => {
    const user = userEvent.setup()
    const { unmount } = open()
    expect(screen.queryByRole('button', { name: /Undo last/ })).toBeNull()
    expect(screen.getByText(/0 ml of 3000 ml today/)).toBeInTheDocument()
    unmount()
    mocks.rows = [H({ water_ml: 1500 })]
    open()
    expect(screen.getByText(/1500 ml of 3000 ml today/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo last 250 ml' }))
    await waitFor(() => expect(mocks.addWater).toHaveBeenCalledWith(DAY, -250))
  })
})

describe('HealthStats and HealthHistory', () => {
  const settings = { water_goal_ml: 3000, steps_goal: 8000 }
  it('shows goals and progress, and a signed weight change', () => {
    render(
      <HealthStats
        sleep={{ minutes: 450, nights: 5 }}
        weight={{ latest: { weight_kg: '80.5' }, change: -1.5 }}
        todayLog={H()}
        settings={settings}
      />,
    )
    expect(screen.getByText('7h 30m')).toBeInTheDocument()
    expect(screen.getByText('5 nights logged')).toBeInTheDocument()
    expect(screen.getByText('1000 ml')).toBeInTheDocument()
    expect(screen.getByText('goal 3000 ml')).toBeInTheDocument()
    expect(screen.getByText('-1.5 kg since first log')).toBeInTheDocument()
  })
  it('says what is missing instead of showing fake zeros for sleep and weight', () => {
    render(<HealthStats sleep={{ minutes: null, nights: 0 }} weight={{ latest: null, change: null }} todayLog={undefined} settings={{}} />)
    expect(screen.getByText('No sleep logged')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.queryByText(/since first log/)).toBeNull()
  })
  it('prefixes a weight GAIN with +', () => {
    render(
      <HealthStats
        sleep={{ minutes: null, nights: 0 }}
        weight={{ latest: { weight_kg: '82' }, change: 2 }}
        todayLog={H()}
        settings={settings}
      />,
    )
    expect(screen.getByText('+2.0 kg since first log')).toBeInTheDocument()
  })
  it('history lists only the metrics that were logged and opens the chosen day', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    expect(describeLog(H({ sleep_minutes: null, water_ml: 0, steps: 0, energy_level: null, weight_kg: null }))).toBe('')
    expect(describeLog(H())).toBe('😴 7h  ·  💧 1000 ml  ·  👟 4,000  ·  ⚡ 3/5  ·  80.5 kg')
    render(<HealthHistory logs={[H()]} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /Mon, 2 Nov/ }))
    expect(onSelect).toHaveBeenCalledWith(DAY)
  })
  it('history has an empty state', () => {
    render(<HealthHistory logs={[]} onSelect={() => {}} />)
    expect(screen.getByText('Your daily logs will appear here.')).toBeInTheDocument()
  })
})

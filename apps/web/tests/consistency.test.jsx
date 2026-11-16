import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ recoverHabitDay: vi.fn(), setHabitStatus: vi.fn() }))
vi.mock('@/services/api', () => ({ recoverHabitDay: mocks.recoverHabitDay, setHabitStatus: mocks.setHabitStatus }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ConsistencyView } from '@/features/habits/ConsistencyView'
import { buildHabitStats } from '@/domain/habits'

const TODAY = '2026-11-12' // Thursday
const habit = {
  id: 'h1',
  name: 'Read',
  color: '#8B5CF6',
  frequency: 'daily',
  days_of_week: [],
  rest_days: [0],
  weekly_target: 3,
  start_date: '2026-11-01',
  archived_at: null,
}
const logs = ['2026-11-09', '2026-11-10'].map((d) => ({ id: d, habit_id: 'h1', log_date: d, status: 'done' }))

function setup(over = {}) {
  const h = { ...habit, ...over }
  const stats = buildHabitStats([h], logs, TODAY, 1)
  return render(<ConsistencyView stats={stats} habits={[h]} logs={logs} today={TODAY} weekStartsOn={1} />)
}

beforeEach(() => {
  mocks.recoverHabitDay.mockReset().mockResolvedValue({})
  mocks.setHabitStatus.mockReset().mockResolvedValue({})
})

describe('ConsistencyView', () => {
  it('shows this week with its working and names the rest day it ignored', () => {
    setup()
    expect(screen.getByText(/of 4 expected days/)).toBeInTheDocument()
    expect(screen.getByText(/Not counted: 1 planned rest/)).toBeInTheDocument()
  })

  it('labels every day of the month with its state, not only by colour', () => {
    setup()
    expect(screen.getByRole('img', { name: 'Monday 9 November: Done' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sunday 8 November: Planned rest' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Wednesday 11 November: Missed' })).toBeInTheDocument()
  })

  it('offers missed days and records a made-up day only when asked', async () => {
    setup()
    expect(mocks.recoverHabitDay).not.toHaveBeenCalled()
    const region = screen.getByText('Pick up where you left off').closest('.lt-card')
    expect(within(region).queryByText(/Sunday 8 Nov/)).not.toBeInTheDocument() // a planned rest day is not offered
    await userEvent.click(screen.getByRole('button', { name: 'I did Read on Wednesday 11 Nov' }))
    expect(mocks.recoverHabitDay).toHaveBeenCalledWith('h1', '2026-11-11', TODAY)
  })

  it('"Skip day" records a skip, which keeps the streak without claiming it was done', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: 'Skip Read on Wednesday 11 Nov' }))
    expect(mocks.setHabitStatus).toHaveBeenCalledWith('h1', '2026-11-11', 'skipped')
  })

  it('explains the calculation on request', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /How is this calculated/ }))
    expect(screen.getByText(/never edited/)).toBeInTheDocument()
  })

  it('has an empty state when nothing is active', () => {
    render(<ConsistencyView stats={[]} habits={[]} logs={[]} today={TODAY} weekStartsOn={1} />)
    expect(screen.getByText('No active habits yet.')).toBeInTheDocument()
  })
})

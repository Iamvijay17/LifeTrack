import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ createTask: vi.fn(), setTaskStatus: vi.fn(), setHabitStatus: vi.fn(), recordFocus: vi.fn() }))
vi.mock('@/services/api', () => ({
  createTask: mocks.createTask,
  setTaskStatus: mocks.setTaskStatus,
  setHabitStatus: mocks.setHabitStatus,
  recordFocus: mocks.recordFocus,
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { companionSnapshot } from '@/domain/companion'
import { CollapsedBar, HabitsWidget, QuickAddWidget, TasksWidget, TimerWidget, UpcomingWidget } from '@/features/companion/widgets'
import { resetCompanionCache, setCompanionPrefs, useCompanionPrefs } from '@/features/companion/useCompanionPrefs'
import { detectCapabilities, openCompanionWindow, useFloatingWindow } from '@/features/companion/window'
import { useCompanionShortcut } from '@/features/companion/useCompanionShortcut'
import { CapabilityNote } from '@/features/companion/Capabilities'

const TODAY = '2026-11-16'
const o = { today: TODAY, tz: 'Asia/Kolkata', nowMs: Date.parse('2026-11-16T05:00:00Z') }
const task = (id, extra = {}) => ({
  id,
  title: `Task ${id}`,
  status: 'pending',
  priority: 'medium',
  due_date: TODAY,
  created_at: '2026-11-01T00:00:00Z',
  ...extra,
})
const stat = (id, extra = {}) => ({
  habit: { id, name: `Habit ${id}`, color: '#8B5CF6', archived_at: null },
  due: true,
  today: null,
  current: 3,
  unit: 'd',
  ...extra,
})

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset().mockResolvedValue({}))
  localStorage.clear()
  resetCompanionCache()
})
afterEach(() => vi.restoreAllMocks())

describe('widgets', () => {
  it('quick add creates a task for today with the same createTask as everywhere else, trims it, and clears the box', async () => {
    render(<QuickAddWidget today={TODAY} />)
    const box = screen.getByRole('textbox', { name: 'New task' })
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await userEvent.type(box, '  Buy milk  {Enter}')
    expect(mocks.createTask).toHaveBeenCalledWith({ title: 'Buy milk', due_date: TODAY })
    expect(box).toHaveValue('')
  })

  it("shows today's progress and completes a task from the list", async () => {
    const snap = companionSnapshot({ tasks: [task('a', { status: 'done' }), task('b')] }, o)
    render(<TasksWidget snap={snap} today={TODAY} />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Tasks done today' })).toHaveAttribute('aria-valuenow', '50')
    await userEvent.click(screen.getByRole('button', { name: 'Complete Task b' }))
    expect(mocks.setTaskStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 'done', TODAY)
  })

  it('has friendly empty states', () => {
    const snap = companionSnapshot({}, o)
    render(
      <div>
        <TasksWidget snap={snap} today={TODAY} />
        <HabitsWidget snap={snap} today={TODAY} />
        <UpcomingWidget snap={snap} today={TODAY} />
      </div>,
    )
    expect(screen.getByText('Nothing planned for today.')).toBeInTheDocument()
    expect(screen.getByText('No habits due today.')).toBeInTheDocument()
    expect(screen.getByText('Nothing coming up this week.')).toBeInTheDocument()
  })

  it('checks a habit in, and undoes it', async () => {
    const snap = companionSnapshot({ habitStats: [stat('x'), stat('y', { today: { status: 'done' } })] }, o)
    render(<HabitsWidget snap={snap} today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Complete Habit x' }))
    expect(mocks.setHabitStatus).toHaveBeenCalledWith('x', TODAY, 'done')
    await userEvent.click(screen.getByRole('button', { name: 'Undo Habit y' }))
    expect(mocks.setHabitStatus).toHaveBeenCalledWith('y', TODAY, null)
  })

  it('lists reminders with when they are due', () => {
    const snap = companionSnapshot(
      { reminders: [{ id: 'r', title: 'Call mum', active: true, remind_date: '2026-11-17', remind_time: '09:00' }] },
      o,
    )
    render(<UpcomingWidget snap={snap} today={TODAY} />)
    expect(screen.getByText('Call mum')).toBeInTheDocument()
    expect(screen.getByText('Tomorrow, 09:00')).toBeInTheDocument()
  })

  it('the slim bar shows the counts and the time left', () => {
    const snap = companionSnapshot({ tasks: [task('a', { status: 'done' }), task('b')], habitStats: [stat('x')] }, o)
    render(<CollapsedBar snap={snap} timer={{ timer: { mode: 'focus' }, left: 754 }} />)
    expect(screen.getByLabelText('Today at a glance')).toHaveTextContent('1/2')
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('12:34')
  })
})

describe('TimerWidget', () => {
  const idle = () => ({ timer: null, left: 0, running: false, start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(() => 600) })
  it('starts a focus block of the chosen length', async () => {
    const timer = idle()
    render(<TimerWidget timer={timer} today={TODAY} />)
    await userEvent.click(screen.getByRole('radio', { name: '50' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(timer.start).toHaveBeenCalledWith({ mode: 'focus', plannedMinutes: 50, taskId: null, topicId: null, label: '' })
  })
  it('shows the countdown with pause and stop, and records what was spent when stopped early', async () => {
    const timer = {
      ...idle(),
      timer: { mode: 'focus', plannedMinutes: 25, taskId: null, topicId: null, label: '' },
      running: true,
      left: 1200,
    }
    render(<TimerWidget timer={timer} today={TODAY} />)
    expect(screen.getByRole('timer', { name: 'Time left' })).toHaveTextContent('20:00')
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(timer.pause).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(mocks.recordFocus).toHaveBeenCalledWith(
      expect.objectContaining({ plannedMinutes: 25, actualSeconds: 600, completed: false, date: TODAY }),
    )
  })
  it('says "saved" only when something was recorded: not for a stop under a minute, nor for a stopped break', async () => {
    const { toast } = await import('sonner')
    toast.mockClear()
    toast.success.mockClear()
    const running = (mode) => ({
      ...idle(),
      timer: { mode, plannedMinutes: 25, taskId: null, topicId: null, label: '' },
      running: true,
      left: 1200,
    })
    mocks.recordFocus.mockResolvedValueOnce(null) // under a minute: nothing stored
    const { unmount } = render(<TimerWidget timer={running('focus')} today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(toast).toHaveBeenCalledWith('Stopped. Under a minute, so nothing was recorded.')
    expect(toast.success).not.toHaveBeenCalled()
    unmount()
    render(<TimerWidget timer={running('short_break')} today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(mocks.recordFocus).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
  })
  it('offers Resume while paused', async () => {
    const timer = { ...idle(), timer: { mode: 'short_break', plannedMinutes: 5 }, running: false, left: 200 }
    render(<TimerWidget timer={timer} today={TODAY} />)
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(timer.resume).toHaveBeenCalled()
    expect(mocks.recordFocus).not.toHaveBeenCalled()
  })
})

describe('layout preferences hook', () => {
  it('persists, follows other windows, and survives corrupt storage', () => {
    const { result } = renderHook(() => useCompanionPrefs())
    act(() => result.current[1]({ density: 'compact', hidden: ['habits'] }))
    expect(JSON.parse(localStorage.getItem('lifetrack:companion'))).toMatchObject({ density: 'compact', hidden: ['habits'] })
    localStorage.setItem('lifetrack:companion', JSON.stringify({ density: 'comfortable', theme: 'dark' }))
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'lifetrack:companion' })))
    expect(result.current[0]).toMatchObject({ density: 'comfortable', theme: 'dark', hidden: [] })
    localStorage.setItem('lifetrack:companion', '{nope')
    act(() => resetCompanionCache())
    expect(result.current[0].order).toHaveLength(5)
    act(() => setCompanionPrefs({ theme: 'light' }))
    expect(result.current[0].theme).toBe('light')
  })
})

describe('browser capabilities', () => {
  it('detects Document Picture-in-Picture without assuming it', () => {
    expect(detectCapabilities().floating).toBe(false) // jsdom has none
    window.documentPictureInPicture = {}
    expect(detectCapabilities().floating).toBe(true)
    delete window.documentPictureInPicture
  })
  it('the floating-window hook reports unsupported and does nothing', async () => {
    const { result } = renderHook(() => useFloatingWindow())
    expect(result.current.supported).toBe(false)
    expect(await result.current.open()).toBeNull()
  })
  it('opens a small window, and reports a blocked pop-up as null', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    expect(openCompanionWindow()).toBeNull()
    expect(open).toHaveBeenCalledWith('/companion', 'lifetrack-companion', expect.stringContaining('width=380'))
  })
  it('Alt+Shift+L opens it; other keys and plain L do not', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus() {} })
    renderHook(() => useCompanionShortcut())
    fireEvent.keyDown(window, { code: 'KeyL' })
    fireEvent.keyDown(window, { code: 'KeyL', altKey: true })
    fireEvent.keyDown(window, { code: 'KeyK', altKey: true, shiftKey: true })
    expect(open).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { code: 'KeyL', altKey: true, shiftKey: true })
    expect(open).toHaveBeenCalledTimes(1)
  })
  it('says plainly what a browser cannot do', () => {
    render(<CapabilityNote caps={{ floating: false, installed: false }} />)
    expect(screen.getByText(/A system tray icon/)).toBeInTheDocument()
    expect(screen.getAllByText('(not available here)').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/Not possible in a browser/)).toBeInTheDocument()
  })
})

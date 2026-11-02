import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MODE_LABEL, isValidMinutes, plannedMinutes, parseFocusTarget, focusableTasks, sessionTitle, newestFirst } from '@/domain/focus'
import { setUserId } from '@/services/session'

const mocks = vi.hoisted(() => ({ remove: vi.fn(), confirm: vi.fn() }))
vi.mock('@/hooks/store', () => ({ remove: mocks.remove }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useFocusTimer } from '@/features/focus/useFocusTimer'
import { TimerCard } from '@/features/focus/TimerCard'
import { SessionList } from '@/features/focus/SessionList'
import { Dial } from '@/features/focus/Dial'

const prefs = { short_break: 5, long_break: 15, long_every: 4 }

describe('focus domain', () => {
  it('picks the block length: preset, custom, or the configured break', () => {
    expect(plannedMinutes({ mode: 'focus', preset: '25', custom: '30', prefs })).toBe(25)
    expect(plannedMinutes({ mode: 'focus', preset: '50', custom: '30', prefs })).toBe(50)
    expect(plannedMinutes({ mode: 'focus', preset: 'custom', custom: '37', prefs })).toBe(37)
    expect(plannedMinutes({ mode: 'short_break', preset: '25', custom: '', prefs })).toBe(5)
    expect(plannedMinutes({ mode: 'long_break', preset: '25', custom: '', prefs })).toBe(15)
  })
  it('accepts whole minutes from 1 to 240 only', () => {
    expect([0, 1, 240, 241, 12.5, NaN, -5].map(isValidMinutes)).toEqual([false, true, true, false, false, false, false])
    expect(isValidMinutes(plannedMinutes({ mode: 'focus', preset: 'custom', custom: '', prefs }))).toBe(false) // blank custom -> 0
  })
  it('parses the "Working on" value into task / topic ids', () => {
    expect(parseFocusTarget('task:t1')).toEqual({ taskId: 't1', topicId: null })
    expect(parseFocusTarget('topic:p9')).toEqual({ taskId: null, topicId: 'p9' })
    expect(parseFocusTarget('')).toEqual({ taskId: null, topicId: null })
    expect(parseFocusTarget('task:')).toEqual({ taskId: null, topicId: null })
  })
  it('only open tasks can be focused on', () => {
    expect(
      focusableTasks([
        { status: 'pending' },
        { status: 'in_progress' },
        { status: 'done' },
        { status: 'cancelled' },
        { status: 'skipped' },
      ]),
    ).toHaveLength(2)
  })
  it('names a session after its task, else topic, else note, else "Focus"; the note is shown only when it adds something', () => {
    const tasks = [{ id: 't1', title: 'Write report' }],
      topics = [{ id: 'p1', name: 'React' }]
    expect(sessionTitle({ task_id: 't1', label: 'Intro' }, tasks, topics)).toEqual({ what: 'Write report', note: 'Intro' })
    expect(sessionTitle({ topic_id: 'p1', label: '' }, tasks, topics)).toEqual({ what: 'React', note: null })
    expect(sessionTitle({ label: 'Deep work' }, tasks, topics)).toEqual({ what: 'Deep work', note: null })
    expect(sessionTitle({ label: '' }, tasks, topics)).toEqual({ what: 'Focus', note: null })
    expect(sessionTitle({ task_id: 'gone', label: 'x' }, tasks, topics)).toEqual({ what: 'x', note: null })
  })
  it('lists newest first without mutating', () => {
    const input = [
      { id: 'a', started_at: '2026-11-02T08:00:00Z' },
      { id: 'b', started_at: '2026-11-02T09:00:00Z' },
    ]
    expect(newestFirst(input).map((s) => s.id)).toEqual(['b', 'a'])
    expect(input[0].id).toBe('a')
  })
  it('labels the modes', () => {
    expect(MODE_LABEL).toEqual({ focus: 'Focus', short_break: 'Short break', long_break: 'Long break' })
  })
})

describe('useFocusTimer', () => {
  const cfg = { mode: 'focus', plannedMinutes: 25, taskId: null, topicId: null, label: 'Reading' }
  const T0 = new Date('2026-11-02T10:00:00Z').getTime()
  beforeEach(() => {
    localStorage.clear()
    setUserId('user-a')
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())
  const tick = (ms) =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })

  it('counts down from the absolute end time and finishes exactly once', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useFocusTimer({ onFinish }))
    expect(result.current.timer).toBeNull()
    expect(result.current.running).toBe(false)
    act(() => result.current.start(cfg))
    expect(result.current.left).toBe(1500)
    expect(result.current.running).toBe(true)
    tick(60_000)
    expect(result.current.left).toBe(1440)
    expect(onFinish).not.toHaveBeenCalled()
    tick(1440_000)
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onFinish.mock.calls[0][0]).toMatchObject({ plannedMinutes: 25, label: 'Reading' })
    expect(onFinish.mock.calls[0][1]).toBe(true)
    expect(result.current.timer).toBeNull()
    tick(5000)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
  it('pause freezes the remaining time, resume continues from it', () => {
    const { result } = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => result.current.start(cfg))
    tick(100_000)
    act(() => result.current.pause())
    expect(result.current.running).toBe(false)
    expect(result.current.paused).toBe(true)
    expect(result.current.left).toBe(1400)
    tick(600_000)
    expect(result.current.left).toBe(1400)
    act(() => result.current.resume())
    tick(10_000)
    expect(result.current.left).toBe(1390)
  })
  it('stop returns the seconds actually spent and clears the timer', () => {
    const { result } = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => result.current.start(cfg))
    tick(90_000)
    let spent
    act(() => {
      spent = result.current.stop()
    })
    expect(spent).toBe(90)
    expect(result.current.timer).toBeNull()
    expect(localStorage.length).toBe(0)
    let again
    act(() => {
      again = result.current.stop()
    })
    expect(again).toBe(0)
  })
  it('survives a reload (a new hook instance picks the running timer up)', () => {
    const first = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => first.result.current.start(cfg))
    tick(30_000)
    first.unmount()
    const second = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    expect(second.result.current.running).toBe(true)
    expect(second.result.current.timer.label).toBe('Reading')
    tick(500)
    expect(second.result.current.left).toBe(1470)
  })
  it('a timer is private to its account: another user on the same browser does not inherit it', () => {
    const a = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => a.result.current.start({ ...cfg, taskId: 'task-of-a', label: 'secret' }))
    a.unmount()
    setUserId('user-b')
    const b = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    expect(b.result.current.timer).toBeNull()
    setUserId('user-a')
    expect(renderHook(() => useFocusTimer({ onFinish: vi.fn() })).result.current.timer).toMatchObject({ taskId: 'task-of-a' })
  })
  it('TWO TABS finishing the same block save it only once', () => {
    const saveA = vi.fn(),
      saveB = vi.fn()
    const tabA = renderHook(() => useFocusTimer({ onFinish: saveA }))
    act(() => tabA.result.current.start({ ...cfg, plannedMinutes: 1 }))
    const tabB = renderHook(() => useFocusTimer({ onFinish: saveB })) // second tab loads the same running timer
    expect(tabB.result.current.running).toBe(true)
    tick(61_000)
    expect(saveA.mock.calls.length + saveB.mock.calls.length).toBe(1)
  })
  it('a pause or stop in one tab is reflected in the other', () => {
    const tabA = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    const tabB = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => tabA.result.current.start(cfg))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'lifetrack:focus-timer:user-a' }))
    })
    expect(tabB.result.current.running).toBe(true)
    act(() => tabA.result.current.stop())
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'lifetrack:focus-timer:user-a' }))
    })
    expect(tabB.result.current.timer).toBeNull()
  })
  it('ignores storage changes for other keys', () => {
    const { result } = renderHook(() => useFocusTimer({ onFinish: vi.fn() }))
    act(() => result.current.start(cfg))
    localStorage.removeItem('lifetrack:focus-timer:user-a')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    })
    expect(result.current.timer).not.toBeNull()
  })
  it('still records a finished block when storage is unavailable', () => {
    const onFinish = vi.fn()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useFocusTimer({ onFinish }))
    act(() => result.current.start({ ...cfg, plannedMinutes: 1 }))
    tick(61_000)
    expect(onFinish).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('Dial', () => {
  it('announces the time remaining and drains the ring', () => {
    const { container, rerender } = render(<Dial left={750} total={1500} mode="focus" />)
    expect(screen.getByRole('timer')).toHaveAccessibleName('12:30 remaining')
    const ring = container.querySelectorAll('circle')[1]
    const circ = 2 * Math.PI * 88
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(circ * 0.5)
    rerender(<Dial left={0} total={1500} mode="focus" />)
    expect(Number(container.querySelectorAll('circle')[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(circ)
    rerender(<Dial left={0} total={0} mode="focus" />)
    expect(Number(container.querySelectorAll('circle')[1].getAttribute('stroke-dashoffset'))).toBe(0) // no total: never NaN
  })
})

describe('TimerCard', () => {
  const idle = { timer: null, left: 0, running: false }
  const base = {
    timer: idle,
    setup: { mode: 'focus', preset: '25', custom: '30', target: '', label: '' },
    onSetup: vi.fn(),
    minutes: 25,
    validMinutes: true,
    tasks: [{ id: 't1', title: 'Write report' }],
    topics: [{ id: 'p1', group_name: 'Frontend', name: 'React' }],
    breakMinutes: 5,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onSkipBreak: vi.fn(),
  }
  const card = (p = {}) => render(<TimerCard {...base} {...p} />)
  beforeEach(() => {
    base.onSetup.mockReset()
    base.onStart.mockReset()
    base.onStop.mockReset()
    base.onSkipBreak.mockReset()
  })

  it('shows the chosen length and starts the block', async () => {
    const user = userEvent.setup()
    card()
    expect(screen.getByRole('timer')).toHaveAccessibleName('25:00 remaining')
    await user.click(screen.getByRole('button', { name: /Start focus/ }))
    expect(base.onStart).toHaveBeenCalled()
  })
  it('an invalid length disables Start', () => {
    card({ validMinutes: false, minutes: 0 })
    expect(screen.getByRole('button', { name: /Start focus/ })).toBeDisabled()
    expect(screen.getByRole('timer')).toHaveAccessibleName('00:00 remaining')
  })
  it('custom length reveals a minutes field; choices are reported without losing the other setup values', async () => {
    const user = userEvent.setup()
    card({ setup: { ...base.setup, preset: 'custom' } })
    expect(screen.getByLabelText('Minutes')).toHaveValue(30)
    await user.selectOptions(screen.getByLabelText('Working on'), 'task:t1')
    expect(base.onSetup).toHaveBeenLastCalledWith({ mode: 'focus', preset: 'custom', custom: '30', target: 'task:t1', label: '' })
  })
  it('lists open tasks and learning topics to work on', () => {
    card()
    expect(screen.getByRole('option', { name: 'Write report' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Frontend · React' })).toBeInTheDocument()
  })
  it('a break shows its length instead of the focus options', () => {
    card({ setup: { ...base.setup, mode: 'short_break' }, minutes: 5 })
    expect(screen.getByText(/5-minute break/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Working on')).toBeNull()
    expect(screen.getByRole('button', { name: /Start short break/ })).toBeInTheDocument()
  })
  it('while a focus block runs: pause / stop & save; no setup controls', async () => {
    const user = userEvent.setup()
    const pause = vi.fn()
    card({ timer: { timer: { mode: 'focus', plannedMinutes: 25, label: 'Reading' }, left: 1234, running: true, pause } })
    expect(screen.getByText(/Focus · Reading/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Working on')).toBeNull()
    expect(screen.getByRole('timer')).toHaveAccessibleName('20:34 remaining')
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    expect(pause).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Stop & save/ }))
    expect(base.onStop).toHaveBeenCalled()
  })
  it('paused shows Resume; during a break the second button skips it', async () => {
    const user = userEvent.setup()
    const resume = vi.fn()
    card({ timer: { timer: { mode: 'short_break', plannedMinutes: 5, label: '' }, left: 200, running: false, resume } })
    await user.click(screen.getByRole('button', { name: 'Resume' }))
    expect(resume).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Skip break' }))
    expect(base.onSkipBreak).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Stop & save/ })).toBeNull()
  })
})

describe('SessionList', () => {
  const sessions = [
    {
      id: 's1',
      task_id: 't1',
      label: 'Intro',
      completed: true,
      planned_minutes: 25,
      actual_seconds: 1500,
      started_at: '2026-11-02T09:00:00Z',
    },
    {
      id: 's2',
      task_id: null,
      topic_id: null,
      label: '',
      completed: false,
      planned_minutes: 25,
      actual_seconds: 600,
      started_at: '2026-11-02T10:00:00Z',
    },
  ]
  const list = (p = {}) =>
    render(
      <SessionList sessions={sessions} tasks={[{ id: 't1', title: 'Write report' }]} topics={[]} tz="UTC" onDelete={() => {}} {...p} />,
    )
  it('shows what and how long, marks early stops, newest first', () => {
    list()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Focus')
    expect(items[0]).toHaveTextContent('10 of 25 min (stopped early)')
    expect(within0(items[0])).toBeTruthy()
    expect(items[1]).toHaveTextContent('Write report — Intro')
    expect(items[1]).toHaveTextContent('25 of 25 min')
    expect(items[1]).not.toHaveTextContent('stopped early')
    expect(screen.getByLabelText('stopped early')).toBeInTheDocument()
    expect(screen.getByLabelText('completed')).toBeInTheDocument()
  })
  it('delete passes the id', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    list({ onDelete })
    await user.click(screen.getAllByRole('button', { name: 'Delete session' })[1])
    expect(onDelete).toHaveBeenCalledWith('s1')
  })
  it('has an empty state', () => {
    list({ sessions: [] })
    expect(screen.getByText('No focus sessions yet today')).toBeInTheDocument()
  })
})
const within0 = (el) => el

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, renderHook, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { z } from 'zod'
import { parseTarget, targetValue, sessionName, weekSeries, historyOf, topicGroups, revisionStatus } from '@/domain/learning'
import { buildHabitStats, summarizeHabits, heatmapCounts, scheduleLabel } from '@/domain/habits'
import { pctText } from '@/lib/format'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), update: vi.fn(), remove: vi.fn(), setHabitStatus: vi.fn(), confirm: vi.fn() }))
vi.mock('@/hooks/store', () => ({ insert: mocks.insert, update: mocks.update, remove: mocks.remove, upsert: vi.fn() }))
vi.mock('@/services/api', () => ({ setHabitStatus: mocks.setHabitStatus }))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { SessionDialog } from '@/features/learning/SessionDialog'
import { StudyGoalDialog } from '@/features/learning/StudyGoalDialog'
import { TopicDialog, parseRevisionDates } from '@/features/learning/TopicDialog'
import { HabitDialog } from '@/features/habits/HabitDialog'
import { HabitRow } from '@/features/habits/HabitRow'
import { useConfirmedDelete } from '@/hooks/useConfirmedDelete'
import { useDialogForm } from '@/hooks/useDialogForm'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset())
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue(undefined)
  mocks.setHabitStatus.mockResolvedValue({})
})
const TODAY = '2026-11-02' // Monday

// ---------------------------------------------------------------------------- learning domain
describe('learning domain', () => {
  const goals = [{ id: 'g1', title: 'Learn React', topic_id: 't1' }]
  const topics = [
    { id: 't1', name: 'React', group_name: 'Frontend' },
    { id: 't2', name: 'SQL', group_name: 'Backend' },
    { id: 't3', name: 'Vue', group_name: 'Frontend' },
  ]
  it("round-trips study targets and inherits the goal's topic", () => {
    expect(parseTarget('g:g1', goals)).toEqual({ goal_id: 'g1', topic_id: 't1' })
    expect(parseTarget('g:missing', goals)).toEqual({ goal_id: null, topic_id: null })
    expect(parseTarget('t:t2', goals)).toEqual({ goal_id: null, topic_id: 't2' })
    expect(parseTarget('', goals)).toEqual({ goal_id: null, topic_id: null })
    expect(targetValue({ goal_id: 'g1', topic_id: 't1' })).toBe('g:g1')
    expect(targetValue({ goal_id: null, topic_id: 't2' })).toBe('t:t2')
    expect(targetValue({ goal_id: null, topic_id: null })).toBe('')
  })
  it('names a session after its goal, else topic, else "General study"', () => {
    expect(sessionName({ goal_id: 'g1' }, goals, topics)).toBe('Learn React')
    expect(sessionName({ topic_id: 't2' }, goals, topics)).toBe('SQL')
    expect(sessionName({}, goals, topics)).toBe('General study')
  })
  it('groups topics in first-seen order and reports revision status', () => {
    expect(topicGroups(topics)).toEqual(['Frontend', 'Backend'])
    expect(revisionStatus({ revision_dates: ['2026-11-02', '2026-11-09'] }, TODAY)).toEqual({ due: true, next: '2026-11-02' })
    expect(revisionStatus({ revision_dates: ['2026-10-01', '2026-11-09'] }, TODAY)).toEqual({ due: false, next: '2026-11-09' })
    expect(revisionStatus({}, TODAY)).toEqual({ due: false, next: null })
  })
  it('builds the weekly series from completed sessions only and sorts history newest first', () => {
    const done = [
      { session_date: '2026-11-02', duration_seconds: 5400, created_at: 'b' },
      { session_date: '2026-11-02', duration_seconds: 1800, created_at: 'a' },
      { session_date: '2026-11-01', duration_seconds: 600, created_at: 'c' },
    ]
    const s = weekSeries(
      done.map((x) => ({ ...x, status: 'completed' })),
      '2026-11-02',
      ['2026-11-02', '2026-11-03'],
      (d) => d.slice(5),
    )
    expect(s).toEqual([
      { d: '2026-11-02', label: '11-02', hours: 2 },
      { d: '2026-11-03', label: '11-03', hours: 0 },
    ])
    expect(historyOf(done).map((x) => x.created_at)).toEqual(['b', 'a', 'c'])
  })
  it('parses revision dates: dedupes, sorts, flags the first invalid one', () => {
    expect(parseRevisionDates('2026-11-09, 2026-11-02 2026-11-09')).toEqual({ dates: ['2026-11-02', '2026-11-09'], invalid: null })
    expect(parseRevisionDates('2026-11-02, tomorrow').invalid).toBe('tomorrow')
    expect(parseRevisionDates('')).toEqual({ dates: [], invalid: null })
  })
})

// ----------------------------------------------------------------------------- habits domain
describe('habits domain', () => {
  const daily = {
    id: 'h1',
    name: 'Read',
    frequency: 'daily',
    days_of_week: [],
    weekly_target: 3,
    start_date: '2026-10-01',
    archived_at: null,
  }
  const weekly = {
    id: 'h2',
    name: 'Run',
    frequency: 'weekly',
    days_of_week: [],
    weekly_target: 3,
    start_date: '2026-10-01',
    archived_at: null,
  }
  const log = (habit_id, log_date, status = 'done') => ({ habit_id, log_date, status })

  it("derives per-habit stats and attaches today's log", () => {
    const logs = [log('h1', '2026-11-02'), log('h1', '2026-11-01'), log('h1', '2026-10-31')]
    const [s] = buildHabitStats([daily], logs, TODAY, 1)
    expect(s.current).toBe(3)
    expect(s.today).toMatchObject({ log_date: TODAY })
    expect(s.due).toBe(false)
    expect(s.rate30).toBeGreaterThan(0)
  })
  it('summarises only active habits', () => {
    const stats = buildHabitStats([daily, { ...weekly, archived_at: 'x' }], [log('h1', TODAY)], TODAY, 1)
    const sum = summarizeHabits(stats, TODAY)
    expect(sum.active).toHaveLength(1)
    expect(sum.doneOnDay).toBe(1)
    expect(sum.bestCurrent).toBe(1)
    expect(summarizeHabits([], TODAY)).toMatchObject({ active: [], doneOnDay: 0, avg30: null })
  })
  it('heatmap: planned vs done, with skipped and rest days removed from the plan', () => {
    const stats = buildHabitStats(
      [daily],
      [log('h1', '2026-11-01'), log('h1', '2026-10-31', 'skipped'), log('h1', '2026-10-30', 'rest')],
      TODAY,
      1,
    )
    const m = heatmapCounts(stats, '2026-10-29', '2026-11-02')
    expect(m.get('2026-11-01')).toEqual({ done: 1, planned: 1 })
    expect(m.get('2026-10-31')).toBeUndefined()
    expect(m.get('2026-10-30')).toBeUndefined()
    expect(m.get('2026-10-29')).toEqual({ done: 0, planned: 1 })
  })
  it('heatmap: a weekly habit only counts on the days it was actually done', () => {
    const stats = buildHabitStats([weekly], [log('h2', '2026-11-01')], TODAY, 1)
    const m = heatmapCounts(stats, '2026-10-30', '2026-11-02')
    expect([...m.keys()]).toEqual(['2026-11-01'])
  })
  it('labels schedules and formats percentages', () => {
    expect(scheduleLabel(daily)).toBe('Every day')
    expect(scheduleLabel(weekly)).toBe('3× / week')
    expect(scheduleLabel({ frequency: 'custom', days_of_week: [1, 3, 0] })).toBe('Sun · Mon · Wed')
    expect(pctText(0.456)).toBe('46%')
    expect(pctText(null)).toBe('—')
    expect(pctText(0)).toBe('0%')
  })
})

// --------------------------------------------------------------------------------- shared hooks
describe('useConfirmedDelete', () => {
  it('deletes only after confirmation', async () => {
    mocks.confirm.mockResolvedValue(true)
    const { result } = renderHook(() => useConfirmedDelete('goals', 'Goal deleted'))
    let ok
    await act(async () => {
      ok = await result.current('g1', { title: 'Delete?' })
    })
    expect(mocks.confirm).toHaveBeenCalledWith({ title: 'Delete?' })
    expect(mocks.remove).toHaveBeenCalledWith('goals', 'g1')
    expect(ok).toBe(true)
  })
  it('does nothing when the user cancels', async () => {
    mocks.confirm.mockResolvedValue(false)
    const { result } = renderHook(() => useConfirmedDelete('goals'))
    let ok
    await act(async () => {
      ok = await result.current('g1', { title: 'Delete?' })
    })
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })
  it('reports failure (false) when the delete itself fails', async () => {
    mocks.confirm.mockResolvedValue(true)
    mocks.remove.mockRejectedValue(new Error('nope'))
    const { result } = renderHook(() => useConfirmedDelete('goals'))
    let ok
    await act(async () => {
      ok = await result.current('g1', {})
    })
    expect(ok).toBe(false)
  })
})

describe('useDialogForm', () => {
  const schema = z.object({ name: z.string() })
  it('resets when opened or when the record changes, but not on unrelated re-renders', () => {
    const { result, rerender } = renderHook(
      ({ open, key, name }) => useDialogForm({ open, schema, recordKey: key, valuesFor: () => ({ name }) }),
      { initialProps: { open: false, key: 'a', name: 'A' } },
    )
    expect(result.current.getValues('name')).toBe('A')
    rerender({ open: true, key: 'a', name: 'A' })
    act(() => result.current.setValue('name', 'typed'))
    rerender({ open: true, key: 'a', name: 'A' }) // same record: keep what was typed
    expect(result.current.getValues('name')).toBe('typed')
    rerender({ open: true, key: 'b', name: 'B' }) // different record: load it
    expect(result.current.getValues('name')).toBe('B')
  })
})

// ------------------------------------------------------------------------------ learning dialogs
describe('SessionDialog', () => {
  const props = {
    open: true,
    onOpenChange: () => {},
    goals: [{ id: 'g1', title: 'Learn React', topic_id: 't1', status: 'active' }],
    topics: [{ id: 't1', name: 'React', group_name: 'Frontend' }],
    today: TODAY,
  }
  it('rejects empty sessions and future dates', async () => {
    const user = userEvent.setup()
    render(<SessionDialog {...props} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter minutes studied or problems solved')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Minutes'), '30')
    await user.clear(screen.getByLabelText('Date'))
    await user.type(screen.getByLabelText('Date'), '2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("You can't log study time in the future")).toBeInTheDocument()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('stores minutes as seconds and resolves the goal to its topic', async () => {
    const user = userEvent.setup()
    render(<SessionDialog {...props} />)
    await user.selectOptions(screen.getByLabelText('What are you studying?'), 'g:g1')
    await user.type(screen.getByLabelText('Minutes'), '45')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1))
    expect(mocks.insert.mock.calls[0][1]).toMatchObject({
      goal_id: 'g1',
      topic_id: 't1',
      duration_seconds: 2700,
      status: 'completed',
      source: 'manual',
      session_date: TODAY,
    })
  })
  it('editing keeps the original source (a timer session stays a timer session)', async () => {
    const user = userEvent.setup()
    render(
      <SessionDialog
        {...props}
        session={{ id: 's1', goal_id: null, topic_id: 't1', session_date: TODAY, duration_seconds: 600, problems_solved: 0, notes: '' }}
      />,
    )
    expect(screen.getByLabelText('Minutes')).toHaveValue(10)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0][2]).not.toHaveProperty('source')
  })
})

describe('StudyGoalDialog and TopicDialog', () => {
  it('converts hours to minutes and takes the category from the topic', async () => {
    const user = userEvent.setup()
    render(<StudyGoalDialog open onOpenChange={() => {}} topics={[{ id: 't1', name: 'React', group_name: 'Frontend' }]} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Name the goal')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Goal'), 'Finish React')
    await user.selectOptions(screen.getByLabelText('Related topic (optional)'), 't1')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'goals',
        expect.objectContaining({ title: 'Finish React', category: 'Frontend', target_minutes: 1200, topic_id: 't1', due_date: null }),
      ),
    )
  })
  it('refuses an invalid revision date and saves clean, sorted dates otherwise', async () => {
    const user = userEvent.setup()
    render(<TopicDialog open onOpenChange={() => {}} today={TODAY} />)
    await user.type(screen.getByLabelText('Topic'), 'Hooks')
    await user.type(screen.getByLabelText('Revision dates'), '2026-11-09, tomorrow')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.insert).not.toHaveBeenCalled())
    await user.clear(screen.getByLabelText('Revision dates'))
    await user.type(screen.getByLabelText('Revision dates'), '2026-11-09, 2026-11-02, 2026-11-09')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'learning_topics',
        expect.objectContaining({ name: 'Hooks', revision_dates: ['2026-11-02', '2026-11-09'] }),
      ),
    )
  })
})

// ------------------------------------------------------------------------------- habits components
describe('HabitDialog', () => {
  it('"Specific days" needs at least one day, then saves the selection', async () => {
    const user = userEvent.setup()
    render(<HabitDialog open onOpenChange={() => {}} today={TODAY} />)
    await user.type(screen.getByLabelText('Name'), 'Gym')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'custom')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Pick at least one day')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mon' }))
    await user.click(screen.getByRole('button', { name: 'Thu' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'habits',
        expect.objectContaining({ name: 'Gym', frequency: 'custom', days_of_week: [1, 4], start_date: TODAY }),
      ),
    )
  })
  it('validates the weekly target range', async () => {
    const user = userEvent.setup()
    render(<HabitDialog open onOpenChange={() => {}} today={TODAY} />)
    await user.type(screen.getByLabelText('Name'), 'Run')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'weekly')
    await user.clear(screen.getByLabelText('Times per week'))
    await user.type(screen.getByLabelText('Times per week'), '9')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('At most 7')).toBeInTheDocument()
  })
})

describe('HabitRow', () => {
  const habit = {
    id: 'h1',
    name: 'Read',
    color: '#8B5CF6',
    frequency: 'daily',
    days_of_week: [],
    weekly_target: 3,
    start_date: '2026-10-01',
    archived_at: null,
  }
  const row = (logs = []) => buildHabitStats([habit], logs, TODAY, 1)[0]
  it('checks in on tap, and ignores an accidental double tap', async () => {
    const user = userEvent.setup()
    render(
      <ul>
        <HabitRow s={row()} date={TODAY} onEdit={() => {}} />
      </ul>,
    )
    const btn = screen.getByRole('button', { name: 'Complete Read' })
    await user.click(btn)
    await user.click(btn)
    await waitFor(() => expect(mocks.setHabitStatus).toHaveBeenCalledTimes(1))
    expect(mocks.setHabitStatus).toHaveBeenCalledWith('h1', TODAY, 'done')
  })
  it('undoes a completed habit (clears the log)', async () => {
    const user = userEvent.setup()
    render(
      <ul>
        <HabitRow s={row([{ habit_id: 'h1', log_date: TODAY, status: 'done' }])} date={TODAY} onEdit={() => {}} />
      </ul>,
    )
    await user.click(screen.getByRole('button', { name: 'Undo Read' }))
    await waitFor(() => expect(mocks.setHabitStatus).toHaveBeenCalledWith('h1', TODAY, null))
  })
  it('cannot be checked when archived', () => {
    render(
      <ul>
        <HabitRow s={buildHabitStats([{ ...habit, archived_at: 'x' }], [], TODAY, 1)[0]} date={TODAY} onEdit={() => {}} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Complete Read' })).toBeDisabled()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })
  it('deleting asks first and warns that history goes with it', async () => {
    const user = userEvent.setup()
    mocks.confirm.mockResolvedValue(true)
    render(
      <ul>
        <HabitRow s={row()} date={TODAY} onEdit={() => {}} />
      </ul>,
    )
    await user.click(screen.getByRole('button', { name: 'Actions for Read' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('habits', 'h1'))
    expect(mocks.confirm.mock.calls[0][0].description).toMatch(/whole history/)
  })
})

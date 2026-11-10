import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { CustomizeDialog } from '@/features/overview/CustomizeDialog'
import { FitnessCard } from '@/features/overview/FitnessCard'
import { HabitsCard } from '@/features/overview/HabitsCard'
import { JobsCard } from '@/features/overview/JobsCard'
import { KpiStrip } from '@/features/overview/KpiStrip'
import { LearningCard } from '@/features/overview/LearningCard'
import { ScoreCard } from '@/features/overview/ScoreCard'
import { SleepCard } from '@/features/overview/SleepCard'
import { SpendingCard } from '@/features/overview/SpendingCard'
import { WeeklyScoreCard } from '@/features/overview/WeeklyScoreCard'
import { useDashboardLayout } from '@/features/overview/useDashboardLayout'
import { useSaveStatus } from '@/hooks/store'
import { SCORE_CATEGORIES } from '@lifetrack/core/score'
import { lifeScore } from '@lifetrack/core/lifeScore'
import { fitnessSnapshot, habitsSnapshot, jobsSnapshot, learningSnapshot, sleepSnapshot } from '@lifetrack/core/snapshots'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const money = (p) => `₹${p / 100}`
const TODAY = '2026-11-10'

// A daily result with one applicable category, enough for the Life Score maths.
const daily = (score) => ({
  date: TODAY,
  score,
  categories: SCORE_CATEGORIES.map((c) => ({
    ...c,
    weight: 20,
    items: score == null ? [] : [{ label: 'Study time', fraction: score / 100, detail: '30 / 60 min' }],
    applicable: score != null && c.key === 'learning',
    fraction: score != null && c.key === 'learning' ? score / 100 : null,
    effectiveWeight: score != null && c.key === 'learning' ? 100 : 0,
  })),
})

describe('Life Score card', () => {
  const fake = (scores) => (d) => daily(scores[d] ?? null)
  const scores = { '2026-11-10': 90, '2026-11-09': 70, '2026-11-08': 80, '2026-11-02': 40 }
  const week = lifeScore(fake(scores), TODAY, 7)
  const month = lifeScore(fake(scores), TODAY, 30)

  it('opens on the 7-day Life Score, with how it was counted and the change on the week before', () => {
    render(<ScoreCard daily={daily(90)} week={week} month={month} />)
    expect(screen.getByTestId('score-value')).toHaveTextContent('80') // (90 + 70 + 80) / 3
    expect(screen.getByText(/Average of 3 days with something planned or logged \(of 7\)/)).toBeInTheDocument()
    expect(screen.getByText(/40.*up/)).toBeInTheDocument() // week before: only the 40 on the 2nd
    expect(screen.getByText(/vs the 7 days before/)).toBeInTheDocument()
  })
  it('switches to today and to 30 days', async () => {
    render(<ScoreCard daily={daily(90)} week={week} month={month} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Today' }))
    expect(screen.getByTestId('score-value')).toHaveTextContent('90')
    expect(screen.queryByText(/vs the 7 days before/)).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: '30 days' }))
    expect(screen.getByTestId('score-value')).toHaveTextContent('70') // (90 + 70 + 80 + 40) / 4
  })
  it('shows a dash, not a zero, and says why when nothing was recorded', () => {
    const none = lifeScore(fake({}), TODAY, 7)
    render(<ScoreCard daily={daily(null)} week={none} month={none} />)
    expect(screen.getByTestId('score-value')).toHaveTextContent('—')
    expect(screen.getByText(/never counted as zero/)).toBeInTheDocument()
    expect(screen.getAllByText('not tracked')).toHaveLength(SCORE_CATEGORIES.length)
  })
  it('lists each category with the points it earned of those available, and explains itself', async () => {
    render(<ScoreCard daily={daily(90)} week={week} month={month} />)
    expect(screen.getByText('80/100')).toBeInTheDocument() // Learning earned 80 of the 100 it carried
    expect(screen.getAllByText('not tracked')).toHaveLength(SCORE_CATEGORIES.length - 1)
    await userEvent.click(screen.getByRole('button', { name: 'How is this calculated?' }))
    const dialog = screen.getByRole('dialog', { name: 'How your Life Score works' })
    expect(within(dialog).getByText(/Learning 80\.0.*= 80/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Nothing planned or logged in this category/)).toHaveLength(SCORE_CATEGORIES.length - 1)
  })
  it("today's explanation names the day's items and weights", async () => {
    render(<ScoreCard daily={daily(90)} week={week} month={month} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Today' }))
    await userEvent.click(screen.getByRole('button', { name: 'How is this calculated?' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Learning 90% × 100% = 90/)).toBeInTheDocument()
    expect(within(dialog).getByText('Study time')).toBeInTheDocument()
  })
})

describe('Life Score trends', () => {
  const scoreFor = (d) => daily(d === '2026-11-10' ? 80 : d === '2026-11-09' ? 60 : null)
  it('charts the last 14 days by default and rolls up weeks and months on request', async () => {
    render(<WeeklyScoreCard scoreFor={scoreFor} today={TODAY} weekStartsOn={1} streak={3} />)
    expect(screen.getByText('3-day active streak')).toBeInTheDocument()
    expect(screen.getByText('Average 70 over 2 days with data')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Weekly' }))
    expect(screen.getByText('Average 70 over 1 week with data')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Monthly' }))
    expect(screen.getByText('Average 70 over 1 month with data')).toBeInTheDocument()
  })
  it('an empty range says so instead of drawing zeros', () => {
    render(<WeeklyScoreCard scoreFor={() => daily(null)} today={TODAY} weekStartsOn={1} streak={0} />)
    expect(screen.getByText('No score in this range yet')).toBeInTheDocument()
    expect(screen.getByText('Plan tasks or habits to see your score over time.')).toBeInTheDocument()
    expect(screen.getByText('Start a streak today')).toBeInTheDocument()
  })
})

describe('KpiStrip', () => {
  const base = { score: 72, change: 5, percent: 50, tasks: { total: 4, done: 2, pending: 2 }, overdue: 3, events: 6 }
  it('shows the day in five numbers and links tasks to the planner', () => {
    wrap(<KpiStrip kpis={base} />)
    const strip = screen.getByTestId('kpi-strip')
    expect(within(strip).getByText('72')).toBeInTheDocument()
    expect(within(strip).getByText('5 up on the week before')).toBeInTheDocument()
    expect(within(strip).getByText('50%')).toBeInTheDocument()
    expect(within(strip).getByText('2/4')).toBeInTheDocument()
    expect(within(strip).getByText('2 pending')).toBeInTheDocument()
    expect(within(strip).getByText('open past their due date')).toBeInTheDocument()
    expect(within(strip).getByText('6')).toBeInTheDocument()
    expect(
      within(strip)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/planner', '/planner'])
  })
  it('uses dashes where nothing is planned, and says all caught up with nothing overdue', () => {
    wrap(<KpiStrip kpis={{ score: null, change: null, percent: null, tasks: { total: 0, done: 0, pending: 0 }, overdue: 0, events: 0 }} />)
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(screen.getByText('nothing recorded yet')).toBeInTheDocument()
    expect(screen.getByText('nothing planned yet')).toBeInTheDocument()
    expect(screen.getByText('no tasks due')).toBeInTheDocument()
    expect(screen.getByText('all caught up')).toBeInTheDocument()
  })
})

describe('module widgets', () => {
  it('Learning: totals, today against the target, goals and skills; empty state before anything exists', () => {
    const sessions = [
      { id: 's', status: 'completed', session_date: TODAY, duration_seconds: 5400, topic_id: 't1', goal_id: null },
      { id: 's2', status: 'completed', session_date: '2026-11-01', duration_seconds: 7200, topic_id: null, goal_id: null },
    ]
    const snap = learningSnapshot({
      sessions,
      goals: [{ id: 'g', title: 'AWS exam', status: 'active', category: 'Learning', target_minutes: 600, topic_id: null }],
      topics: [{ id: 't1', name: 'React', group_name: 'Frontend', archived: false }],
      today: TODAY,
      targetMinutes: 120,
    })
    const { unmount } = wrap(<LearningCard snap={snap} />)
    expect(screen.getByText('3.5 h')).toBeInTheDocument()
    expect(screen.getByText('1h 30m of 2h')).toBeInTheDocument()
    expect(screen.getByText('AWS exam')).toBeInTheDocument()
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Learning' })).toHaveAttribute('href', '/learning')
    unmount()
    wrap(<LearningCard snap={learningSnapshot({ today: TODAY })} />)
    expect(screen.getByText(/Log a study session/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a study session' })).toHaveAttribute('href', '/learning')
  })

  it('Jobs: counts, the next interview and recent status changes', () => {
    const apps = [
      { id: 'a1', company: 'Acme', job_title: 'Dev', status: 'interview', applied_date: TODAY },
      { id: 'a2', company: 'Beta', job_title: 'SRE', status: 'rejected', applied_date: null },
    ]
    const snap = jobsSnapshot({
      applications: apps,
      interviews: [{ id: 'e', application_id: 'a1', round_name: 'Technical', status: 'scheduled', scheduled_at: '2099-01-01T05:00:00Z' }],
      history: [{ id: 'h', application_id: 'a1', from_status: 'applied', to_status: 'interview', changed_at: new Date().toISOString() }],
      today: TODAY,
      nowMs: Date.parse('2026-11-10T00:00:00Z'),
    })
    wrap(<JobsCard snap={snap} tz="Asia/Kolkata" />)
    expect(screen.getByText('Next: Acme · Technical')).toBeInTheDocument()
    expect(screen.getByText('Applied → Interview')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: Acme/ })).toHaveAttribute('href', '/jobs?app=a1')
    expect(screen.getByText('scheduled')).toBeInTheDocument()
  })
  it('Jobs: empty state', () => {
    wrap(<JobsCard snap={jobsSnapshot({ today: TODAY })} tz="Asia/Kolkata" />)
    expect(screen.getByRole('link', { name: 'Add an application' })).toBeInTheDocument()
  })

  it('Fitness: state, week progress, and "not logged" for steps and calories that were never tracked', () => {
    const snap = fitnessSnapshot({
      workouts: [{ id: 'w', status: 'completed', name: 'Legs', workout_date: '2026-11-09', duration_minutes: 50 }],
      health: null,
      settings: { workout_plan: { 1: 'r', 3: 'r' }, steps_goal: 8000 },
      today: TODAY,
    })
    wrap(<FitnessCard snap={snap} />)
    expect(screen.getByText('1 of 2 planned workouts')).toBeInTheDocument()
    expect(screen.getByText('1 workout')).toBeInTheDocument()
    expect(screen.getAllByText('not logged')).toHaveLength(2)
    expect(screen.getByRole('progressbar', { name: 'Weekly workout goal' })).toHaveAttribute('aria-valuenow', '50')
  })
  it('Fitness: with no weekly plan there is no goal bar, only a pointer to plan one', () => {
    wrap(<FitnessCard snap={fitnessSnapshot({ today: TODAY, settings: {} })} />)
    expect(screen.getByText('no weekly plan set')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Weekly workout goal' })).toBeNull()
  })

  it('Sleep: last night against the goal, the week, and consistency needing three timed nights', () => {
    const log = (d, m) => ({ id: d, log_date: d, sleep_minutes: m, bedtime: '23:00', wake_time: '06:30' })
    const snap = sleepSnapshot({
      healthLogs: [log('2026-11-10', 450), log('2026-11-09', 400), log('2026-11-08', 480)],
      settings: {},
      today: TODAY,
    })
    wrap(<SleepCard snap={snap} />)
    expect(screen.getByTestId('sleep-last')).toHaveTextContent('7h 30m')
    expect(screen.getByText('100% of your 7h 30m goal')).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Very regular')).toBeInTheDocument()
    expect(screen.getByText('3 of 7 nights logged')).toBeInTheDocument()
  })
  it('Sleep: nothing recorded offers to log it', () => {
    wrap(<SleepCard snap={sleepSnapshot({ today: TODAY })} />)
    expect(screen.getByRole('link', { name: "Log last night's sleep" })).toHaveAttribute('href', '/health')
  })

  it('Habits: progress, pending habits, streaks and the routine', () => {
    const habit = (id, name) => ({
      id,
      name,
      color: '#8B5CF6',
      frequency: 'daily',
      start_date: '2026-11-01',
      archived_at: null,
      days_of_week: [],
    })
    const log = (habit_id, log_date) => ({ id: habit_id + log_date, habit_id, log_date, status: 'done' })
    const snap = habitsSnapshot({
      habits: [habit('a', 'Read'), habit('b', 'Stretch')],
      habitLogs: [log('a', TODAY), log('a', '2026-11-09')],
      today: TODAY,
      agenda: { doneCount: 2, total: 5 },
    })
    wrap(<HabitsCard snap={snap} />)
    expect(screen.getByTestId('habits-done')).toHaveTextContent('1/2')
    expect(screen.getByText('Stretch')).toBeInTheDocument() // still to do
    expect(screen.getByText('2 days')).toBeInTheDocument() // Read's streak
    expect(screen.getByText('2 of 5 done')).toBeInTheDocument()
  })
  it('Habits: no habits yet links to create one', () => {
    wrap(<HabitsCard snap={habitsSnapshot({ today: TODAY })} />)
    expect(screen.getByRole('link', { name: 'Create a habit' })).toHaveAttribute('href', '/habits')
  })

  it('Finance: income, expenses, what is left of the budget, and the latest transactions', () => {
    const sum = { income: 500000, expense: 50000, savings: 0, budget: 100000, budgetUsed: 0.5, remaining: 50000, count: 3 }
    const recent = [
      { id: '1', type: 'expense', category: 'Food', note: 'Lunch', amount_paise: 20000, txn_date: TODAY },
      { id: '2', type: 'income', category: 'Salary', note: '', amount_paise: 500000, txn_date: '2026-11-01' },
    ]
    wrap(<SpendingCard sum={sum} money={money} recent={recent} />)
    expect(screen.getByText('₹5000')).toBeInTheDocument() // income
    expect(screen.getByText('Budget left')).toBeInTheDocument()
    expect(screen.getByText('Lunch', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('−₹200')).toBeInTheDocument()
    expect(screen.getByText('+₹5000', { selector: 'span' })).toBeInTheDocument()
  })
  it('Finance: without a budget, left-to-spend is "not logged" rather than a made-up figure', () => {
    wrap(<SpendingCard sum={{ income: 0, expense: 0, savings: 0, budget: 0, budgetUsed: null, remaining: null, count: 0 }} money={money} />)
    expect(screen.getByText('Left to spend')).toBeInTheDocument()
    expect(screen.getByText('no budget set')).toBeInTheDocument()
    expect(screen.getByText(/Nothing recorded this month/)).toBeInTheDocument()
  })
})

describe('CustomizeDialog: sizes, moving and restoring', () => {
  const open = (props) => render(<CustomizeDialog open onOpenChange={() => {}} prefs={{}} {...props} />)
  it('picks a size for a widget and reports it', async () => {
    const onResize = vi.fn()
    open({ onResize })
    await userEvent.click(screen.getByRole('radio', { name: 'Finance: Large' }))
    expect(onResize).toHaveBeenCalledWith('spending', 'lg')
  })
  it('shows the current size, the default when nothing is saved', () => {
    open({ prefs: { sizes: { goals: 'full' } } })
    expect(screen.getByRole('radio', { name: 'Goal progress: Full width' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Recent activity: Small' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Career & learning: Medium' })).toHaveAttribute('aria-checked', 'true')
  })
  it('offers only the sizes a widget is built for, and none for a full-width widget', () => {
    open()
    expect(screen.queryByRole('radio', { name: 'Today agenda: Small' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Today agenda: Medium' })).toBeInTheDocument()
    expect(screen.getAllByText('Always full width').length).toBeGreaterThan(0)
  })
  it('a hidden widget has no size picker', () => {
    open({ prefs: { goals: false } })
    expect(screen.queryByRole('radio', { name: /Goal progress/ })).toBeNull()
  })
  it('moves a widget with the arrows, and the ends cannot move further', async () => {
    const onReorder = vi.fn()
    open({ prefs: { order: ['quick', 'today'] }, onReorder })
    expect(screen.getByRole('button', { name: 'Move Quick actions up' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Quick actions down' }))
    expect(onReorder.mock.calls[0][0].slice(0, 2)).toEqual(['today', 'quick'])
  })
  it('Restore default layout is disabled until something changed, then asks to reset', async () => {
    const onReset = vi.fn()
    const { unmount } = open({ onReset })
    expect(screen.getByRole('button', { name: /Restore default layout/ })).toBeDisabled()
    unmount()
    open({ prefs: { sizes: { goals: 'md' } }, onReset })
    await userEvent.click(screen.getByRole('button', { name: /Restore default layout/ }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('useDashboardLayout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })
  afterEach(() => vi.useRealTimers())

  it('shows a change at once and saves several changes as one request', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useDashboardLayout({}, save))
    act(() => {
      result.current.setVisible('goals', false)
      result.current.setSize('activity', 'md')
      result.current.setOrder(['quick', 'today'])
    })
    expect(result.current.prefs).toEqual({ goals: false, sizes: { activity: 'md' }, order: ['quick', 'today'] })
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ dashboard_widgets: { goals: false, sizes: { activity: 'md' }, order: ['quick', 'today'] } })
  })
  it('keeps what is already saved (other devices, the mobile app) when it changes one thing', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useDashboardLayout({ nutrition: false, mobileOnly: true }, save))
    act(() => result.current.setSize('goals', 'lg'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(save).toHaveBeenCalledWith({ dashboard_widgets: { nutrition: false, mobileOnly: true, sizes: { goals: 'lg' } } })
  })
  it('ignores a size the widget is not built for, with nothing saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useDashboardLayout({}, save))
    act(() => result.current.setSize('today', 'sm'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(save).not.toHaveBeenCalled()
  })
  it('reset saves straight away and hands back what it replaced for Undo', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useDashboardLayout({ goals: false }, save))
    let before
    await act(async () => {
      before = result.current.reset()
    })
    expect(before).toEqual({ goals: false })
    expect(save).toHaveBeenCalledWith({ dashboard_widgets: {} })
    await act(async () => {
      result.current.restore(before)
    })
    expect(save).toHaveBeenLastCalledWith({ dashboard_widgets: { goals: false } })
  })
  it('goes back to the saved layout and says so when the save fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useDashboardLayout({ goals: true }, save))
    act(() => result.current.setVisible('goals', false))
    expect(result.current.prefs.goals).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't save your layout"))
    expect(result.current.prefs.goals).toBe(true)
  })
  it('counts a change that is still waiting as "saving" (so leaving the page is guarded) until it is written', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => ({ layout: useDashboardLayout({}, save), status: useSaveStatus() }))
    act(() => result.current.layout.setVisible('goals', false))
    expect(result.current.status.status).toBe('saving')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(result.current.status.status).toBe('saved')
  })
  it('saves a pending change when the dashboard is left', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => useDashboardLayout({}, save))
    act(() => result.current.setVisible('nutrition', false))
    unmount()
    expect(save).toHaveBeenCalledWith({ dashboard_widgets: { nutrition: false } })
  })
})

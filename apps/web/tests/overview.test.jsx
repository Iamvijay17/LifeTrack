import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PrioritiesCard } from '@/features/overview/PrioritiesCard'
import { TodayStats } from '@/features/overview/TodayStats'
import { SpendingCard } from '@/features/overview/SpendingCard'
import { NutritionCard } from '@/features/overview/NutritionCard'
import { dayStatus } from '@/domain/nutrition'
import { GoalsCard } from '@/features/overview/GoalsCard'
import { ActivityCard } from '@/features/overview/ActivityCard'
import { CustomizeDialog } from '@/features/overview/CustomizeDialog'
import { COMMAND_WIDGETS } from '@lifetrack/core/commandCenter'

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const money = (p) => `₹${p / 100}`

describe('PrioritiesCard', () => {
  const props = { priorities: [], hasTasksToday: false, openTasks: 0, doneTasks: 0, onComplete: vi.fn(), onAddTask: vi.fn() }
  it('completes a task when tapped', async () => {
    const onComplete = vi.fn()
    const t = { id: '1', title: 'Write report' }
    wrap(<PrioritiesCard {...props} priorities={[t]} hasTasksToday openTasks={2} doneTasks={1} onComplete={onComplete} />)
    expect(screen.getByText('2 pending · 1 completed today')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Complete Write report' }))
    expect(onComplete).toHaveBeenCalledWith(t)
  })
  it('distinguishes "all done" from "no tasks" and offers Add task', async () => {
    const onAddTask = vi.fn()
    const { unmount } = wrap(<PrioritiesCard {...props} hasTasksToday onAddTask={onAddTask} />)
    expect(screen.getByText(/All priorities done/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Add task/ }))
    expect(onAddTask).toHaveBeenCalled()
    unmount()
    wrap(<PrioritiesCard {...props} />)
    expect(screen.getByText(/No tasks for today/)).toBeInTheDocument()
  })
})

describe('TodayStats', () => {
  const h = {
    studyMinutes: 30,
    studyRunning: false,
    gym: 'Planned',
    workoutName: undefined,
    health: undefined,
    appliedThisWeek: 2,
    spentToday: 12300,
    habitsDone: 1,
    habitsDue: 3,
  }
  it('shows values and goals', () => {
    wrap(
      <TodayStats
        h={{ ...h, health: { water_ml: 500, steps: 12345, sleep_minutes: 450 } }}
        settings={{ daily_study_target_minutes: 60, water_goal_ml: 2000, steps_goal: 10000 }}
        money={money}
      />,
    )
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('500 ml')).toBeInTheDocument()
    expect(screen.getByText('12,345')).toBeInTheDocument()
    expect(screen.getByText('goal 2000')).toBeInTheDocument()
    expect(screen.getByText('₹123')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.getByText('last night')).toBeInTheDocument()
  })
  it('handles missing health data and no habits due', () => {
    wrap(<TodayStats h={{ ...h, habitsDone: 0, habitsDue: 0, studyRunning: true }} settings={{}} money={money} />)
    expect(screen.getByText('not logged')).toBeInTheDocument()
    expect(screen.getByText('none due today')).toBeInTheDocument()
    expect(screen.getByText('timer running')).toBeInTheDocument()
    expect(screen.getByText('0 ml')).toBeInTheDocument()
  })
})

describe('SpendingCard', () => {
  it('shows budget use and what is left', () => {
    wrap(<SpendingCard sum={{ expense: 50000, income: 0, budget: 100000, budgetUsed: 0.5, remaining: 50000 }} money={money} />)
    expect(screen.getByTestId('month-spend')).toHaveTextContent('₹500')
    expect(screen.getByText('50% used · ₹500 left')).toBeInTheDocument()
  })
  it('exactly on budget counts as left, not over', () => {
    wrap(<SpendingCard sum={{ expense: 100000, income: 0, budget: 100000, budgetUsed: 1, remaining: 0 }} money={money} />)
    expect(screen.getByText('100% used · ₹0 left')).toBeInTheDocument()
  })
  it('shows how far over budget', () => {
    wrap(<SpendingCard sum={{ expense: 150000, income: 0, budget: 100000, budgetUsed: 1.5, remaining: -50000 }} money={money} />)
    expect(screen.getByText('150% used · ₹500 over')).toBeInTheDocument()
  })
  it('prompts to set a budget when there is none', () => {
    wrap(<SpendingCard sum={{ expense: 0, income: 90000, budget: 0, budgetUsed: null, remaining: 0 }} money={money} />)
    expect(screen.getByText(/set a budget in Finance/)).toBeInTheDocument()
    expect(screen.queryByText(/budget$/)).not.toBeInTheDocument()
  })
})

describe('NutritionCard', () => {
  const log = (kcal) => ({ log_date: '2026-11-10', meal_type: 'lunch', kcal, protein_g: 20, carbs_g: 50, fat_g: 10, fiber_g: 0 })
  const show = (logs, settings) => wrap(<NutritionCard status={dayStatus(logs, settings, '2026-11-10')} />)
  it('shows calories eaten, the target and what is left, linking to Nutrition', () => {
    show([log(600)], { calorie_goal: 2000 })
    expect(screen.getByTestId('food-kcal')).toHaveTextContent('600 kcal')
    expect(screen.getByText(/30% of target · 1400 kcal left/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nutrition' })).toHaveAttribute('href', '/nutrition')
  })
  it('shows how far over the target', () => {
    show([log(2300)], { calorie_goal: 2000 })
    expect(screen.getByText(/300 kcal over/)).toBeInTheDocument()
  })
  it('without a target it says so rather than showing 0%, and an empty day offers Log food', () => {
    show([], null)
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument()
    expect(screen.queryByText(/% of target/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Log food' })).toBeInTheDocument()
  })
})

describe('GoalsCard', () => {
  it('lists goals with their percent', () => {
    wrap(<GoalsCard rows={[{ goal: { id: 'a', title: 'Learn Go' }, progress: { percent: 40 } }]} />)
    expect(screen.getByText('Learn Go')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
  it('empty state links to goals', () => {
    wrap(<GoalsCard rows={[]} />)
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/goals')
  })
})

describe('ActivityCard', () => {
  it('renders every activity kind without crashing', () => {
    const at = new Date().toISOString()
    const items = ['task', 'study', 'workout', 'money', 'job', 'habit', 'sleep'].map((kind) => ({ kind, at, text: `item-${kind}` }))
    render(<ActivityCard items={items} />)
    for (const i of items) expect(screen.getByText(i.text)).toBeInTheDocument()
  })
  it('empty state', () => {
    render(<ActivityCard items={[]} />)
    expect(screen.getByText('Your activity will show up here.')).toBeInTheDocument()
  })
})

describe('CustomizeDialog', () => {
  it('reflects prefs (default on) and reports toggles', async () => {
    const onToggle = vi.fn()
    render(<CustomizeDialog open onOpenChange={() => {}} prefs={{ score: false }} onToggle={onToggle} />)
    const score = screen.getByRole('switch', { name: 'Life Score' })
    expect(score).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: "Today's progress" })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(score)
    expect(onToggle).toHaveBeenCalledWith('score', true)
  })
})

describe('CustomizeDialog arranging', () => {
  it('lists widgets in the saved order, with the rest after them', () => {
    render(<CustomizeDialog open onOpenChange={() => {}} prefs={{ order: ['quick', 'score'] }} onToggle={() => {}} onReorder={() => {}} />)
    const names = screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))
    expect(names.slice(0, 2)).toEqual(['Quick actions', 'Life Score'])
    expect(names).toHaveLength(COMMAND_WIDGETS.length)
  })
})

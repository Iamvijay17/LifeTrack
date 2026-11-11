import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { todayStr } from '@/lib/dates'
import { db, freshBackend, renderApp, signedInUser } from '../components/helpers'

// Right-click menus through the real app and the in-browser backend: what a person does, and what ends up stored.
vi.setConfig({ testTimeout: 60_000 })
const TZ = 'Asia/Kolkata'
let TODAY
beforeEach(async () => {
  await freshBackend()
  await signedInUser()
  TODAY = todayStr(TZ)
})

const rightClick = (el, pos = { clientX: 200, clientY: 160 }) => fireEvent.contextMenu(el, pos)
const item = (name) => screen.findByRole('menuitem', { name })
const choice = (name) => screen.findByRole('menuitemradio', { name })
const rows = (table) => db.list(table)
const gone = () => waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
async function openPage(path, ready) {
  renderApp(path)
  return ready ? await ready() : null
}

describe('Tasks (Daily Planner)', () => {
  const taskRow = async (title) => (await screen.findByText(title, {}, { timeout: 40_000 })).closest('li')

  it('page menu adds a task for the viewed day; a row menu completes, reprioritises, re-dates, recategorises, duplicates, renames and deletes', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Write report', due_date: TODAY, priority: 'medium', category: 'Personal' }])
    renderApp('/planner')
    const row = await taskRow('Write report')

    // page-level: empty space offers "New task"
    rightClick(screen.getByRole('main'))
    await user.click(await item(/New task for/))
    expect(await screen.findByRole('dialog', { name: 'New task' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // complete (and undo)
    rightClick(row)
    await user.click(await item('Mark complete'))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('done'))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('pending'))

    // priority
    rightClick(await taskRow('Write report'))
    await user.click(await item('Priority'))
    await user.click(await choice('High'))
    await waitFor(async () => expect((await rows('tasks'))[0].priority).toBe('high'))

    // due date
    rightClick(await taskRow('Write report'))
    await user.click(await item('Due date'))
    await user.click(await item('Tomorrow'))
    await waitFor(async () => expect((await rows('tasks'))[0].due_date).not.toBe(TODAY))
    await user.click(await screen.findByRole('button', { name: 'Undo' })) // it left today's list; Undo brings it back
    await waitFor(async () => expect((await rows('tasks'))[0].due_date).toBe(TODAY))

    // category
    rightClick(await taskRow('Write report'))
    await user.click(await item('Move to category'))
    await user.click(await choice('Learning'))
    await waitFor(async () => expect((await rows('tasks'))[0].category).toBe('Learning'))

    // duplicate
    rightClick(await taskRow('Write report'))
    await user.click(await item('Duplicate'))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title).sort()).toEqual(['Write report', 'Write report (copy)']))

    // rename
    rightClick(await taskRow('Write report (copy)'))
    await user.click(await item('Rename'))
    const dialog = await screen.findByRole('dialog', { name: 'Rename task' })
    await user.clear(within(dialog).getByLabelText('Title'))
    await user.type(within(dialog).getByLabelText('Title'), 'Second report')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toContain('Second report'))

    // delete asks first
    rightClick(await taskRow('Second report'))
    await user.click(await item('Delete task'))
    const confirm = await screen.findByRole('dialog')
    expect((await rows('tasks')).length).toBe(2)
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toEqual(['Write report']))
  })

  it('several selected tasks get bulk actions', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [
      { title: 'One', due_date: TODAY },
      { title: 'Two', due_date: TODAY },
      { title: 'Three', due_date: TODAY },
    ])
    renderApp('/planner')
    const one = await taskRow('One')
    await user.keyboard('{Control>}')
    await user.click(one)
    await user.click(await taskRow('Two'))
    await user.keyboard('{/Control}')
    expect(await screen.findByText('2 tasks selected')).toBeInTheDocument()
    rightClick(await taskRow('Two'))
    await user.click(await item('Priority'))
    await user.click(await choice('Low'))
    await waitFor(async () =>
      expect(
        (await rows('tasks'))
          .filter((t) => t.priority === 'low')
          .map((t) => t.title)
          .sort(),
      ).toEqual(['One', 'Two']),
    )
    rightClick(await taskRow('One'))
    await user.click(await item('Delete 2 tasks'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete 2' }))
    await waitFor(async () => expect((await rows('tasks')).map((t) => t.title)).toEqual(['Three']))
  })
})

describe('Dashboard', () => {
  it('empty-space menu refreshes, customises and manages widgets', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Seed', due_date: TODAY }])
    renderApp('/')
    await screen.findByTestId('widget-grid', {}, { timeout: 40_000 })
    rightClick(screen.getByRole('main'))
    expect(await item('Refresh data')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Reset layout' })).toBeNull() // default layout: nothing to reset
    await user.click(screen.getByRole('menuitem', { name: 'Customize dashboard' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // a widget: hide it, then it comes back through Add widget
    const widget = within(screen.getByTestId('widget-grid')).getAllByText(/./, { selector: '[data-widget] *' })[0].closest('[data-widget]')
    const key = widget.dataset.widget
    rightClick(widget)
    await user.click(await item('Hide widget'))
    await waitFor(() => expect(screen.getByTestId('widget-grid').querySelector(`[data-widget="${key}"]`)).toBeNull())
    rightClick(screen.getByRole('main'))
    await user.click(await item('Add widget'))
    const sub = await screen.findByRole('menu', { name: 'Add widget' })
    await user.click(within(sub).getAllByRole('menuitem')[0])
    await waitFor(() => expect(screen.getByTestId('widget-grid').querySelector(`[data-widget="${key}"]`)).not.toBeNull())
    void gone
  })
})

describe('Calendar', () => {
  const openCalendar = async () => {
    renderApp('/calendar?view=month')
    await screen.findByTestId('calendar', {}, { timeout: 40_000 })
    await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull())
  }
  const at = (h) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    return d
  }

  it('an empty day offers new event / new task, and an event can be edited, re-dated, given a reminder, duplicated and deleted', async () => {
    const user = userEvent.setup()
    await db.insert('calendar_events', [
      { title: 'Standup', starts_at: at(15).toISOString(), ends_at: at(16).toISOString(), timezone: TZ, alert_minutes: [] },
    ])
    await openCalendar()

    // an empty month cell
    rightClick(screen.getByTestId(`cell-${TODAY}`))
    expect(await item(/^New event/)).toBeInTheDocument()
    await user.click(await item(/^New task/))
    expect(await screen.findByRole('dialog', { name: /New task/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // the event: reminder
    const chip = () => screen.getAllByText('Standup')[0].closest('[data-cal-item]')
    rightClick(await waitFor(chip))
    await user.click(await item('Set reminder'))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: '15 minutes before' }))
    await waitFor(async () => expect((await rows('calendar_events'))[0].alert_minutes).toEqual([15]))

    // change date
    rightClick(chip())
    await user.click(await item('Change date'))
    await user.click(await item('Tomorrow'))
    await waitFor(async () => expect(new Date((await rows('calendar_events'))[0].starts_at).getDate()).not.toBe(new Date().getDate()))
    await user.click(await screen.findByRole('button', { name: 'Undo' })) // and back
    await waitFor(async () => expect(new Date((await rows('calendar_events'))[0].starts_at).getDate()).toBe(new Date().getDate()))

    // duplicate
    rightClick(chip())
    await user.click(await item('Duplicate'))
    await waitFor(async () => expect((await rows('calendar_events')).map((e) => e.title).sort()).toEqual(['Standup', 'Standup (copy)']))

    // delete (asks first)
    rightClick(screen.getAllByText('Standup (copy)')[0].closest('[data-cal-item]'))
    await user.click(await item('Delete event'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await rows('calendar_events')).map((e) => e.title)).toEqual(['Standup']))
  })

  it('a task on the calendar can be completed and re-dated from its menu', async () => {
    const user = userEvent.setup()
    await db.insert('tasks', [{ title: 'Call the bank', due_date: TODAY }])
    await openCalendar()
    const chip = () => screen.getAllByText('Call the bank')[0].closest('[data-cal-item]')
    rightClick(await waitFor(chip))
    await user.click(await item('Mark complete'))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('done'))
    rightClick(chip())
    await user.click(await item('Mark incomplete'))
    await waitFor(async () => expect((await rows('tasks'))[0].status).toBe('pending'))
    rightClick(chip())
    await user.click(await item('Change date'))
    await user.click(await item('In a week'))
    await waitFor(async () => expect((await rows('tasks'))[0].due_date).not.toBe(TODAY))
  })
})

describe('Career & Learning', () => {
  it('a study goal: complete (undo), add a study session for it, view progress, rename, duplicate, delete', async () => {
    const user = userEvent.setup()
    await db.insert('goals', [
      { title: 'Finish DSA course', category: 'Learning', target_minutes: 600, status: 'active', period: 'monthly' },
    ])
    renderApp('/learning')
    await user.click(await screen.findByRole('tab', { name: 'Goals' }, { timeout: 40_000 }))
    const card = async (t) => (await screen.findByText(t)).closest('.lt-card')

    // empty space: page menu
    rightClick(screen.getByRole('main'))
    expect(await item('New goal')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Log study session' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    rightClick(await card('Finish DSA course'))
    await user.click(await item('Mark complete'))
    await waitFor(async () => expect((await rows('goals'))[0].status).toBe('completed'))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await rows('goals'))[0].status).toBe('active'))

    rightClick(await card('Finish DSA course'))
    await user.click(await item('View progress'))
    expect(await screen.findByText(/of 10h/)).toBeInTheDocument()

    rightClick(await card('Finish DSA course'))
    await user.click(await item('Add study session'))
    const dialog = await screen.findByRole('dialog', { name: 'Log a study session' })
    await user.type(within(dialog).getByLabelText(/minutes/i), '45')
    await user.click(within(dialog).getByRole('button', { name: /Log|Save/ }))
    await waitFor(async () => {
      const [s] = await rows('study_sessions')
      expect(s.goal_id).toBe((await rows('goals'))[0].id)
      expect(s.duration_seconds).toBe(2700)
    })

    rightClick(await card('Finish DSA course'))
    await user.click(await item('Duplicate'))
    await waitFor(async () =>
      expect((await rows('goals')).map((g) => g.title).sort()).toEqual(['Finish DSA course', 'Finish DSA course (copy)']),
    )

    rightClick(await card('Finish DSA course (copy)'))
    await user.click(await item('Delete goal'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await rows('goals')).map((g) => g.title)).toEqual(['Finish DSA course']))
  })
})

describe('Job Switch', () => {
  it('an application: update status (undo), follow-up reminder, copy details, schedule interview, delete; a column adds one', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await db.insert('job_applications', [{ company: 'Acme', job_title: 'Platform Engineer', status: 'applied', location: 'Chennai' }])
    renderApp('/jobs')
    const card = async () => (await screen.findByText('Acme', {}, { timeout: 40_000 })).closest('[data-testid="app-card"]')

    // a column's empty space adds an application there
    await card()
    rightClick(screen.getByTestId('col-interview'))
    await user.click(await item(/Add application/))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    rightClick(await card())
    await user.click(await item('Update status'))
    await user.click(await choice('Assessment'))
    await waitFor(async () => expect((await rows('job_applications'))[0].status).toBe('assessment'))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect((await rows('job_applications'))[0].status).toBe('applied'))

    rightClick(await card())
    await user.click(await item('Follow-up reminder'))
    await user.click(await item('In a week'))
    await waitFor(async () => expect((await rows('job_applications'))[0].followup_date).toBeTruthy())

    rightClick(await card())
    await user.click(await item('Copy job details'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Platform Engineer at Acme')))

    rightClick(await card())
    await user.click(await item('Schedule interview'))
    expect(await screen.findByRole('dialog', { name: /interview/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    rightClick(await card())
    await user.click(await item('Delete application'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await rows('job_applications')).toHaveLength(0))
  })
})

describe('Gym & Fitness', () => {
  it('a workout in History: duplicate (with its sets), mark a skipped day completed, delete; page menu logs a workout', async () => {
    const user = userEvent.setup()
    const [w] = await db.insert('workouts', [
      { workout_date: TODAY, name: 'Push day', status: 'completed', kind: 'strength', duration_minutes: 50 },
    ])
    await db.insert('exercise_logs', [{ workout_id: w.id, exercise_name: 'Bench press', set_number: 1, reps: 8, weight_kg: 60 }])
    await db.insert('workouts', [{ workout_date: TODAY, name: 'Skipped', status: 'skipped', kind: 'other' }])
    renderApp('/fitness?tab=history')
    const row = async (t) => {
      const hits = await screen.findAllByText(t, {}, { timeout: 40_000 })
      return hits.map((h) => h.closest('li')).find((li) => li?.querySelector('button[aria-expanded]')) // not the calendar legend's entry
    }

    rightClick(await row('Push day'))
    await user.click(await item('Duplicate to today'))
    await waitFor(async () => {
      expect((await rows('workouts')).filter((x) => x.name === 'Push day')).toHaveLength(2)
      expect(await rows('exercise_logs')).toHaveLength(2)
    })

    rightClick(await row('Skipped'))
    expect(screen.queryByRole('menuitem', { name: 'Edit workout' })).toBeNull() // only a completed workout has sets to edit
    await user.click(await item('Mark completed'))
    await waitFor(async () => expect((await rows('workouts')).find((x) => x.name === 'Skipped').status).toBe('completed'))

    rightClick(await row('Skipped'))
    await user.click(await item('Delete workout'))
    await user.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await rows('workouts')).some((x) => x.name === 'Skipped')).toBe(false))

    rightClick(screen.getByRole('main'))
    await user.click(await item('Log workout'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('an exercise offers its details page only when the database has it', async () => {
    const { exerciseItems } = await import('@/features/fitness/contextMenu')
    const navigate = vi.fn()
    const e = { id: '1', name: 'Squat' }
    expect(exerciseItems(e, { demo: null, navigate })[0].hidden).toBe(true)
    const view = exerciseItems(e, { demo: { id: 'Barbell_Squat' }, navigate })[0]
    view.onSelect()
    expect(navigate).toHaveBeenCalledWith('/fitness/exercises/Barbell_Squat')
  })
})

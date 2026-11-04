import '@testing-library/jest-dom/vitest'
import { pickOption } from './pickers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { groupTasksForDay, byPriority, isOpen } from '@/domain/tasks'
import { filterNotes, notePreview, noteCategories, noteTags } from '@/domain/notes'
import { optionalDay, requiredDay } from '@/lib/validation'

// ---- store / api mocks (hoisted) ------------------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  rows: { journal_entries: [] },
  upsert: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  createTask: vi.fn(),
}))
vi.mock('@/hooks/store', () => ({
  useTable: (t) => ({ rows: mocks.rows[t] ?? [], loading: false, error: null }),
  upsert: mocks.upsert,
  update: mocks.update,
  insert: mocks.insert,
  remove: mocks.remove,
}))
vi.mock('@/services/api', () => ({ createTask: mocks.createTask }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { Journal } from '@/features/notes/Journal'
import { NoteDialog } from '@/features/notes/NoteDialog'
import { TaskDialog } from '@/features/planner/TaskDialog'

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset?.())
  mocks.rows = { journal_entries: [] }
  mocks.upsert.mockResolvedValue({})
  mocks.insert.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.createTask.mockResolvedValue({})
})

// ---- pure logic -----------------------------------------------------------------------------------------------------
const T = (o) => ({
  id: Math.random().toString(36),
  status: 'pending',
  priority: 'medium',
  created_at: '2026-11-01T00:00:00Z',
  due_date: '2026-11-02',
  ...o,
})

describe('groupTasksForDay', () => {
  const today = '2026-11-02'
  it('ranks open tasks by priority, top three become priorities', () => {
    const tasks = [
      T({ title: 'low', priority: 'low' }),
      T({ title: 'h1', priority: 'high' }),
      T({ title: 'm1' }),
      T({ title: 'h2', priority: 'high', created_at: '2026-11-01T01:00:00Z' }),
      T({ title: 'm2', created_at: '2026-11-01T02:00:00Z' }),
    ]
    const g = groupTasksForDay(tasks, today, today)
    expect(g.priorities.map((t) => t.title)).toEqual(['h1', 'h2', 'm1'])
    expect(g.pending.map((t) => t.title)).toEqual(['m2', 'low'])
    expect(g.count).toBe(5)
  })
  it('splits done / skipped / cancelled and keeps them out of the open lists', () => {
    const g = groupTasksForDay(
      [T({ status: 'done' }), T({ status: 'skipped' }), T({ status: 'cancelled' }), T({ status: 'in_progress' })],
      today,
      today,
    )
    expect([g.done.length, g.off.length, g.priorities.length]).toEqual([1, 2, 1])
  })
  it('shows overdue only when viewing today, oldest first; someday = open with no date', () => {
    const tasks = [
      T({ title: 'old', due_date: '2026-10-30' }),
      T({ title: 'older', due_date: '2026-10-20' }),
      T({ title: 'none', due_date: null }),
      T({ title: 'done-old', due_date: '2026-10-01', status: 'done' }),
    ]
    expect(groupTasksForDay(tasks, today, today).overdue.map((t) => t.title)).toEqual(['older', 'old'])
    expect(groupTasksForDay(tasks, '2026-11-03', today).overdue).toEqual([])
    expect(groupTasksForDay(tasks, today, today).someday.map((t) => t.title)).toEqual(['none'])
  })
  it('exports the shared predicates', () => {
    expect(isOpen({ status: 'in_progress' })).toBe(true)
    expect(isOpen({ status: 'done' })).toBe(false)
    expect([T({ priority: 'low' }), T({ priority: 'high' })].sort(byPriority)[0].priority).toBe('high')
  })
})

describe('notes helpers', () => {
  const N = (o) => ({ title: '', body: '', category: 'General', tags: [], pinned: false, updated_at: '2026-11-01T00:00:00Z', ...o })
  const notes = [
    N({ title: 'A', updated_at: '2026-11-01T00:00:00Z' }),
    N({ title: 'B', tags: ['react'], category: 'Learning', updated_at: '2026-11-02T00:00:00Z' }),
    N({ title: 'C', pinned: true, body: 'Hello World', updated_at: '2026-10-01T00:00:00Z' }),
  ]
  it('sorts pinned first then newest', () => expect(filterNotes(notes).map((n) => n.title)).toEqual(['C', 'B', 'A']))
  it('filters by text (title/body/tags), category and tag, case-insensitively', () => {
    expect(filterNotes(notes, { q: 'hello' }).map((n) => n.title)).toEqual(['C'])
    expect(filterNotes(notes, { q: 'REACT' }).map((n) => n.title)).toEqual(['B'])
    expect(filterNotes(notes, { category: 'Learning' }).map((n) => n.title)).toEqual(['B'])
    expect(filterNotes(notes, { tag: 'react' }).map((n) => n.title)).toEqual(['B'])
    expect(filterNotes(notes, { q: 'zzz' })).toEqual([])
  })
  it('lists categories/tags once, sorted; previews strip Markdown symbols', () => {
    expect(noteCategories(notes)).toEqual(['General', 'Learning'])
    expect(noteTags(notes)).toEqual(['react'])
    expect(notePreview('# Title\n- **bold** item')).toBe('Title\n bold item')
  })
})

describe('shared validators', () => {
  it('optionalDay accepts blank or a real date; requiredDay only a real date', () => {
    expect(optionalDay.safeParse('').success).toBe(true)
    expect(optionalDay.safeParse('2026-02-30').success).toBe(false)
    expect(requiredDay().safeParse('').success).toBe(false)
    expect(requiredDay('x').safeParse('2026-11-02').success).toBe(true)
  })
})

// ---- components -----------------------------------------------------------------------------------------------------
describe('TaskDialog', () => {
  const open = (props = {}) => render(<TaskDialog open onOpenChange={() => {}} defaultDate="2026-11-02" {...props} />)
  it('validates, then creates the task with normalised values', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    open({ onOpenChange })
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Give the task a title')).toBeInTheDocument()
    expect(mocks.createTask).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Title'), '  Write report ')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledTimes(1))
    expect(mocks.createTask.mock.calls[0][0]).toMatchObject({
      title: 'Write report',
      due_date: '2026-11-02',
      recurrence: 'none',
      recurrence_until: null,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('requires a due date for repeating tasks and a sensible end date', async () => {
    const user = userEvent.setup()
    open({ defaultDate: '' })
    await user.type(screen.getByLabelText('Title'), 'Gym')
    await pickOption(user, screen.getByLabelText('Repeat'), 'daily')
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('Repeating tasks need a due date')).toBeInTheDocument()
    expect(mocks.createTask).not.toHaveBeenCalled()
  })
  it('prefills when editing and saves through store.update', async () => {
    const user = userEvent.setup()
    open({
      task: {
        id: 't1',
        title: 'Existing',
        notes: '',
        category: 'Gym',
        priority: 'high',
        due_date: '2026-11-05',
        recurrence: 'none',
        recurrence_until: null,
      },
    })
    expect(screen.getByLabelText('Title')).toHaveValue('Existing')
    expect(screen.getByLabelText('Priority')).toHavePickerValue('high')
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('tasks', 't1', expect.objectContaining({ title: 'Renamed', priority: 'high' })),
    )
  })
  it('does not wipe what you typed when the parent re-renders', async () => {
    const user = userEvent.setup()
    const { rerender } = open()
    await user.type(screen.getByLabelText('Title'), 'Keep me')
    rerender(<TaskDialog open onOpenChange={() => {}} defaultDate="2026-11-02" />)
    expect(screen.getByLabelText('Title')).toHaveValue('Keep me')
  })
})

describe('NoteDialog', () => {
  const open = (props = {}) => render(<NoteDialog open onOpenChange={() => {}} {...props} />)
  it('rejects an empty note, then saves with parsed tags and null attachments', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    expect(await screen.findByText('Write a title or some content')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Title'), 'Retro')
    await user.type(screen.getByLabelText('Tags'), '#Work, work, Retro')
    await user.click(screen.getByRole('button', { name: 'Save note' }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith(
        'notes',
        expect.objectContaining({ title: 'Retro', tags: ['work', 'retro'], goal_id: null, task_id: null, pinned: false }),
      ),
    )
  })
  it('prefills an existing note and updates it', async () => {
    const user = userEvent.setup()
    open({
      note: { id: 'n1', title: 'T', body: 'B', category: 'Ideas', tags: ['a', 'b'], pinned: true, goal_id: 'g1', task_id: null },
      goals: [{ id: 'g1', title: 'Goal one' }],
    })
    expect(screen.getByLabelText('Tags')).toHaveValue('a, b')
    expect(screen.getByLabelText('Attach to goal')).toHavePickerValue('g1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('notes', 'n1', expect.objectContaining({ pinned: true, goal_id: 'g1', category: 'Ideas' })),
    )
  })
})

describe('Journal', () => {
  const entry = (o = {}) => ({
    id: 'e1',
    entry_date: '2026-11-02',
    mood: 4,
    content: 'Stored text',
    wins: '',
    updated_at: '2026-11-02T08:00:00Z',
    created_at: '2026-11-02T08:00:00Z',
    ...o,
  })

  it('loads the stored entry and starts clean', () => {
    mocks.rows.journal_entries = [entry()]
    render(<Journal date="2026-11-02" />)
    expect(screen.getByLabelText('Reflection')).toHaveValue('Stored text')
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
  it('saves the typed values and returns to a clean state', async () => {
    const user = userEvent.setup()
    render(<Journal date="2026-11-02" />)
    await user.type(screen.getByLabelText('Reflection'), 'Good day')
    await user.click(screen.getByRole('button', { name: 'Great' }))
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith(
        'journal_entries',
        { entry_date: '2026-11-02', mood: 5, content: 'Good day', wins: '' },
        expect.anything(),
      ),
    )
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull())
  })
  it('never saves an empty entry', async () => {
    const user = userEvent.setup()
    render(<Journal date="2026-11-02" />)
    await user.type(screen.getByLabelText('Reflection'), 'x')
    await user.clear(screen.getByLabelText('Reflection'))
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled()
  })
  it('a remote update does NOT overwrite text you are typing, but updates a clean form', async () => {
    const user = userEvent.setup()
    mocks.rows.journal_entries = [entry()]
    const { rerender } = render(<Journal date="2026-11-02" />)
    await user.type(screen.getByLabelText('Reflection'), ' + my edit')
    mocks.rows.journal_entries = [entry({ content: 'Changed on phone', updated_at: '2026-11-02T09:00:00Z' })]
    rerender(<Journal date="2026-11-02" />)
    expect(screen.getByLabelText('Reflection')).toHaveValue('Stored text + my edit') // unsaved work is kept
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
  it('a remote update is applied when there is nothing unsaved', () => {
    mocks.rows.journal_entries = [entry()]
    const { rerender } = render(<Journal date="2026-11-02" />)
    mocks.rows.journal_entries = [entry({ content: 'Changed on phone', updated_at: '2026-11-02T09:00:00Z' })]
    rerender(<Journal date="2026-11-02" />)
    expect(screen.getByLabelText('Reflection')).toHaveValue('Changed on phone')
  })
  it("switching day loads that day's entry", () => {
    mocks.rows.journal_entries = [entry(), entry({ id: 'e2', entry_date: '2026-11-03', content: 'Tomorrow' })]
    const { rerender } = render(<Journal date="2026-11-02" />)
    rerender(<Journal date="2026-11-03" />)
    expect(screen.getByLabelText('Reflection')).toHaveValue('Tomorrow')
  })
  it('flags an over-long reflection instead of failing silently', async () => {
    const user = userEvent.setup()
    render(<Journal date="2026-11-02" />)
    fireLong(screen.getByLabelText('Reflection'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText(/under 20,000 characters/)).toBeInTheDocument()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

function fireLong(el) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(el, 'x'.repeat(20001))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

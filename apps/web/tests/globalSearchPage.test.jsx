import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import * as store from '@/hooks/store'
import { setUserId } from '@/services/session'
import { db } from '@/services/db'
import SearchPage from '@/features/search/SearchPage'
import { pushQuery, sanitizeQueries } from '@/features/search/history'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }), Toaster: () => null }))

const Where = () => {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}
const setup = (path = '/search') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="*" element={<p>opened page</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
const input = () => screen.getByRole('combobox', { name: 'Search all records' })
const results = () => screen.findAllByTestId('search-result')
const where = () => screen.getByTestId('where').textContent

async function seed() {
  await store.insert('tasks', {
    title: 'Quarterly report',
    notes: 'send to finance',
    category: 'Personal',
    priority: 'high',
    due_date: '2026-11-20',
  })
  await store.insert('tasks', {
    title: 'Plan the report outline',
    category: 'Learning',
    priority: 'low',
    due_date: '2026-10-02',
    status: 'done',
  })
  await store.insert('notes', { title: 'Reading list', body: 'books about the quarterly report process', category: 'Ideas', tags: [] })
  await store.insert('goals', { title: 'Finish the course', notes: 'report to the mentor monthly', category: 'Learning' })
  await store.insert('transactions', { type: 'expense', amount_paise: 5000, category: 'Food', txn_date: '2026-11-03', note: 'Team lunch' })
}

beforeEach(async () => {
  localStorage.clear()
  setUserId('user-a')
  store.resetStore()
  await Promise.all(
    ['tasks', 'notes', 'goals', 'transactions', 'workouts', 'study_sessions', 'calendar_events', 'habits'].map(async (t) =>
      db.removeMany?.(
        t,
        (await db.list(t)).map((r) => r.id),
      ),
    ),
  )
  vi.clearAllMocks()
})

describe('the search page', () => {
  it('starts with a welcome and no results, and does not search an empty box', async () => {
    await seed()
    setup()
    expect(await screen.findByTestId('search-landing')).toBeInTheDocument()
    expect(screen.queryByTestId('search-result')).not.toBeInTheDocument()
  })

  it('searches your own data across modules, marks the matching words and shows a count', async () => {
    await seed()
    setup()
    await userEvent.type(input(), 'report')
    const rows = await results()
    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((r) => r.dataset.kind))).toEqual(new Set(['task', 'note', 'goal']))
    expect(screen.getByTestId('search-count')).toHaveTextContent('1–4 of 4 results for “report”')
    // best title first: "Quarterly report" ends with the word, "Plan the report outline" has it mid-title
    expect(within(rows[0]).getAllByText('report', { selector: 'mark' }).length).toBeGreaterThan(0)
    expect(where()).toContain('q=report')
  })

  it('shows an empty state with a way back when nothing matches', async () => {
    await seed()
    setup()
    await userEvent.type(input(), 'zzzzqqq')
    expect(await screen.findByText('Nothing found')).toBeInTheDocument()
  })

  it('narrows by module, status, priority and sort, and the address remembers it', async () => {
    await seed()
    setup('/search?q=report')
    expect(await results()).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: 'Notes & journal' }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(1))
    expect(where()).toContain('m=notes')
    await userEvent.click(screen.getByRole('button', { name: 'Notes & journal' })) // off again
    await userEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: /^Status/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Done' }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(1))
    expect(screen.getByTestId('search-result')).toHaveTextContent('Plan the report outline')
    expect(where()).toContain('st=done')
    await userEvent.click(screen.getByRole('button', { name: /Clear filters/ }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(4))
  })

  it('sorts newest first and oldest first by the record date', async () => {
    await seed()
    const order = async (sort) => {
      const view = setup(`/search?q=report&m=planner&sort=${sort}`)
      await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(2))
      const text = (await results()).map((r) => r.textContent)
      view.unmount()
      return text
    }
    const oldest = await order('oldest')
    const newest = await order('newest')
    expect(oldest[0]).toContain('Plan the report outline')
    expect(newest[0]).toContain('Quarterly report')
  })

  it('browses with filters alone, with no text', async () => {
    await seed()
    setup('/search?pr=high')
    const rows = await results()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Quarterly report')
  })

  it('links each result to its record and remembers it as recently viewed', async () => {
    await seed()
    setup('/search?q=reading')
    const [row] = await results()
    expect(row.getAttribute('href')).toMatch(/^\/notes\?note=/)
    await userEvent.click(row)
    expect(await screen.findByText('opened page')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('lifetrack:recents:user-a'))[0]).toMatchObject({ kind: 'note', label: 'Reading list' })
    expect(JSON.parse(localStorage.getItem('lifetrack:search:queries:user-a'))).toEqual(['reading'])
  })

  it('offers recent searches and recently viewed records before anything is typed', async () => {
    localStorage.setItem('lifetrack:search:queries:user-a', JSON.stringify(['tax', 'gym plan']))
    localStorage.setItem(
      'lifetrack:recents:user-a',
      JSON.stringify([{ id: 'n1', kind: 'note', label: 'Reading list', to: '/notes?note=n1', module: 'notes' }]),
    )
    setup()
    expect(await screen.findByRole('button', { name: 'gym plan' })).toBeInTheDocument()
    expect(within(screen.getByTestId('search-viewed')).getByText('Reading list')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Remove tax/ }))
    expect(screen.queryByRole('button', { name: 'tax' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'gym plan' }))
    await waitFor(() => expect(where()).toContain('q=gym+plan'))
  })

  it('suggests as you type, from earlier searches and titles, and Enter picks one', async () => {
    await seed()
    localStorage.setItem('lifetrack:search:queries:user-a', JSON.stringify(['quarterly review']))
    setup()
    await userEvent.type(input(), 'quar')
    const list = await screen.findByRole('listbox', { name: 'Suggestions' })
    const options = within(list)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options[0]).toContain('quarterly review')
    expect(options.some((o) => o.includes('Quarterly report'))).toBe(true)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(where()).toContain('q=quarterly+review'))
  })

  it('pages through long result lists', async () => {
    for (let i = 0; i < 25; i++)
      await store.insert('tasks', { title: `Pagination task ${String(i).padStart(2, '0')}`, due_date: '2026-11-01' })
    setup('/search?q=pagination&sort=oldest')
    expect(await results()).toHaveLength(20)
    expect(screen.getByTestId('search-count')).toHaveTextContent('1–20 of 25')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(5))
    expect(screen.getByTestId('search-count')).toHaveTextContent('21–25 of 25')
    expect(where()).toContain('page=2')
    await userEvent.click(screen.getByRole('button', { name: /Previous/ }))
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(20))
  })

  it('goes back to the last page when the address points past the end', async () => {
    await seed()
    setup('/search?q=report&page=9')
    await waitFor(() => expect(where()).not.toContain('page=9'))
    expect(await results()).toHaveLength(4)
  })

  it("never shows another account's records", async () => {
    await seed()
    setUserId('user-b')
    store.resetStore()
    setup('/search?q=report')
    expect(await screen.findByText('Nothing found')).toBeInTheDocument()
    expect(screen.queryByTestId('search-result')).not.toBeInTheDocument()
  })
})

describe('history helpers', () => {
  it('keeps recent searches short, unique and well-formed', () => {
    expect(pushQuery(['b', 'aa'], 'AA')).toEqual(['AA', 'b'])
    expect(pushQuery([], 'x')).toEqual([]) // one character is not worth keeping
    expect(sanitizeQueries(['ok', 5, '', '   ', 'x'.repeat(200), 'OK'])).toEqual(['ok'])
    expect(sanitizeQueries({})).toEqual([])
    expect(
      pushQuery(
        Array.from({ length: 8 }, (_, i) => `q${i}`),
        'new',
      ),
    ).toHaveLength(8)
  })
})

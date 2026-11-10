import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const catalogJson = readFileSync(path.resolve(process.cwd(), 'public/exercises/catalog.json'), 'utf8')
const mocks = vi.hoisted(() => ({ insert: vi.fn(), exercises: [] }))
vi.mock('@/hooks/store', () => ({
  insert: mocks.insert,
  remove: vi.fn(),
  removeMany: vi.fn(),
  useTables: () => ({ data: { exercises: mocks.exercises }, loading: false, error: null }),
}))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { ExerciseBrowser } from '@/features/fitness/catalog/ExerciseBrowser'
import { ExerciseImage } from '@/features/fitness/catalog/ExerciseImage'
import ExerciseDetailPage from '@/features/fitness/catalog/ExerciseDetailPage'
import { LibraryTab } from '@/features/fitness/LibraryTab'

let fetchCalls
beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({})
  mocks.exercises = []
  fetchCalls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      fetchCalls++
      expect(String(url)).toBe('/exercises/catalog.json') // the only thing the app fetches itself: a local file
      return new Response(catalogJson, { status: 200, headers: { 'Content-Type': 'application/json' } })
    }),
  )
})

const browse = () =>
  render(
    <MemoryRouter>
      <ExerciseBrowser />
    </MemoryRouter>,
  )
const cards = () => within(screen.getByRole('list', { name: 'Exercises' })).getAllByRole('listitem')

describe('ExerciseImage', () => {
  it('uses the one frame (3:2, contain, local path) and the original file untouched', () => {
    render(<ExerciseImage path="Air_Bike/0.jpg" alt="Air Bike: start" />)
    const img = screen.getByAltText('Air Bike: start')
    expect(img).toHaveAttribute('src', '/exercises/Air_Bike/0.jpg')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveClass('object-contain')
    expect(screen.getByTestId('exercise-frame')).toHaveClass('aspect-[3/2]')
  })
  it('loads eagerly when it is the hero image', () => {
    render(<ExerciseImage path="Air_Bike/0.jpg" alt="x" priority />)
    expect(screen.getByAltText('x')).toHaveAttribute('loading', 'eager')
  })
  it('falls back to a labelled placeholder when there is no path', () => {
    render(<ExerciseImage path={null} alt="" label="No start image" />)
    expect(screen.queryByRole('img', { hidden: false, name: '' })).toBeNull()
    expect(screen.getByRole('img', { name: 'No start image' })).toBeInTheDocument()
    expect(screen.getByTestId('exercise-frame')).toHaveClass('aspect-[3/2]') // same frame, so layouts never jump
  })
  it('falls back when the file fails to load', async () => {
    render(<ExerciseImage path="Nope/0.jpg" alt="broken" />)
    fireEvent.error(screen.getByAltText('broken'))
    expect(await screen.findByRole('img', { name: 'No demonstration image' })).toBeInTheDocument()
    expect(screen.queryByAltText('broken')).toBeNull()
  })
  it('encodes unusual characters in file names', () => {
    render(<ExerciseImage path="Dips_-_Chest_Version/0.jpg" alt="d" />)
    expect(screen.getByAltText('d')).toHaveAttribute('src', '/exercises/Dips_-_Chest_Version/0.jpg')
  })
})

describe('ExerciseBrowser', () => {
  it('lists the database a page at a time, with category counts and the source credit', async () => {
    browse()
    expect(await screen.findByText('876 exercises')).toBeInTheDocument()
    expect(cards()).toHaveLength(24)
    for (const c of ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Abs', 'Cardio'])
      expect(screen.getByRole('button', { name: new RegExp(`^${c}`) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cardio\s*14$/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Free Exercise DB' })).toHaveAttribute('href', 'https://github.com/yuhonas/free-exercise-db')
    expect(screen.getByText(/Unlicense \(public domain\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Show 24 more/ }))
    expect(cards()).toHaveLength(48)
    expect(fetchCalls).toBeLessThanOrEqual(1)
  })
  it('searches by name and by muscle, ranking the best name match first', async () => {
    browse()
    await screen.findByText('876 exercises')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'plank')
    expect(cards()[0]).toHaveTextContent('Plank')
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'quadriceps')
    expect(screen.getByTestId('result-count')).toHaveTextContent('227 exercises')
  })
  it('filters by category and stacks with search; chips show what each would give', async () => {
    browse()
    await screen.findByText('876 exercises')
    await userEvent.click(screen.getByRole('button', { name: /^Cardio/ }))
    expect(screen.getByTestId('result-count')).toHaveTextContent('14 exercises')
    expect(screen.getByRole('button', { name: /^Cardio/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.type(screen.getByRole('searchbox'), 'treadmill')
    expect(screen.getByTestId('result-count')).toHaveTextContent('3 exercises')
    expect(screen.getByRole('button', { name: /^Chest\s*0$/ })).toBeInTheDocument()
  })
  it('shows an empty state with a way out, and clear filters resets everything', async () => {
    browse()
    await screen.findByText('876 exercises')
    await userEvent.type(screen.getByRole('searchbox'), 'zzzzqqq')
    expect(screen.getByText('No exercises match')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    expect(screen.getByTestId('result-count')).toHaveTextContent('876 exercises')
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
  it('each card links to its detail page and shows the start image', async () => {
    browse()
    await screen.findByText('876 exercises')
    const first = cards()[0]
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/fitness/exercises/3_4_Sit-Up')
    expect(within(first).getByAltText('3/4 Sit-Up: starting position')).toHaveAttribute('src', '/exercises/3_4_Sit-Up/0.jpg')
  })
  it('says so, with Retry, when the database file cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    // The catalog is cached once it loads; an earlier test in this file has loaded it, so reload modules for a clean cache.
    vi.resetModules()
    const { ExerciseBrowser: Fresh } = await import('@/features/fitness/catalog/ExerciseBrowser')
    render(
      <MemoryRouter>
        <Fresh />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Exercise database unavailable \(500\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('whole library', () => {
  it('renders a card with a local start image and a detail link for every one of the 876 exercises', async () => {
    const { ExerciseCard } = await import('@/features/fitness/catalog/ExerciseBrowser')
    const all = JSON.parse(catalogJson).exercises
    const { container } = render(
      <MemoryRouter>
        {all.map((e) => (
          <ExerciseCard key={e.id} exercise={e} />
        ))}
      </MemoryRouter>,
    )
    expect(container.querySelectorAll('a')).toHaveLength(876)
    const imgs = [...container.querySelectorAll('img')]
    expect(imgs).toHaveLength(873) // three exercises have no images and show the fallback
    for (const img of imgs) expect(img.getAttribute('src')).toMatch(/^\/exercises\/[^/]+\/0\.jpg$/)
    expect(container.querySelectorAll('[data-testid=exercise-frame]')).toHaveLength(876) // every card has the same frame
  })
})

describe('ExerciseDetailPage', () => {
  const page = (id) =>
    render(
      <MemoryRouter initialEntries={[`/fitness/exercises/${id}`]}>
        <Routes>
          <Route path="/fitness/exercises/:id" element={<ExerciseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
  it('shows start and end images, muscles, equipment and numbered instructions', async () => {
    page('Barbell_Bench_Press_-_Medium_Grip')
    expect(await screen.findByRole('heading', { level: 1, name: 'Barbell Bench Press - Medium Grip' })).toBeInTheDocument()
    expect(screen.getByAltText(/start position/)).toHaveAttribute('src', '/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg')
    expect(screen.getByAltText(/end position/)).toHaveAttribute('src', '/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg')
    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByText('End')).toBeInTheDocument()
    expect(screen.getByText('Primary muscles').nextSibling).toHaveTextContent('Chest')
    expect(screen.getByText('Equipment', { selector: 'dt' }).nextSibling).toHaveTextContent('Barbell')
    expect(within(screen.getByRole('region', { name: 'Instructions' })).getAllByRole('listitem').length).toBeGreaterThan(2)
    expect(screen.getByText(/Unlicense \(public domain\)/)).toBeInTheDocument()
  })
  it('adds the exercise to the library in LifeTrack vocabulary, once', async () => {
    page('Plank')
    await userEvent.click(await screen.findByRole('button', { name: /Add to my exercises/ }))
    await waitFor(() =>
      expect(mocks.insert).toHaveBeenCalledWith('exercises', { name: 'Plank', muscle_group: 'Core', equipment: 'Bodyweight' }),
    )
  })
  it('says it is already yours instead of offering to add it again', async () => {
    mocks.exercises = [{ id: 'e1', name: 'Plank', muscle_group: 'Core', equipment: 'Bodyweight' }]
    page('Plank')
    expect(await screen.findByText('In your exercises')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to my exercises/ })).toBeNull()
  })
  it('degrades gracefully with no images and with no instructions', async () => {
    page('Kettlebell_Halo')
    expect(await screen.findByRole('img', { name: /no demonstration images/i })).toBeInTheDocument()
    expect(screen.queryByAltText(/position/)).toBeNull()
    expect(screen.getByRole('button', { name: /Add to my exercises/ })).toBeInTheDocument()
  })
  it('explains a missing instruction list', async () => {
    page('Push_Press')
    expect(await screen.findByText(/no written instructions/i)).toBeInTheDocument()
  })
  it('handles an unknown exercise', async () => {
    page('Not_A_Thing')
    expect(await screen.findByText('Exercise not found')).toBeInTheDocument()
  })
})

describe('LibraryTab', () => {
  const groups = [
    {
      group: 'Chest',
      items: [
        { id: 'a', name: 'Pushups', equipment: 'Bodyweight' },
        { id: 'b', name: 'My custom move', equipment: '' },
      ],
    },
  ]
  it('keeps your exercises, and links the ones the database knows to their demonstration', async () => {
    render(
      <MemoryRouter>
        <LibraryTab groups={groups} onCreate={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('tab', { name: 'My exercises' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('link', { name: 'See how to do Pushups' })).toHaveAttribute('href', '/fitness/exercises/Pushups')
    expect(screen.getByText('My custom move').closest('a')).toBeNull() // not in the database: plain text, as before
    expect(screen.getByRole('button', { name: 'Remove Pushups' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New exercise' })).toBeInTheDocument()
  })
  it('switches to the database, and can open there', async () => {
    render(
      <MemoryRouter initialEntries={['/fitness?tab=library&view=browse']}>
        <LibraryTab groups={groups} onCreate={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('searchbox', { name: 'Search exercises' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'My exercises' }))
    expect(screen.getByText('My custom move')).toBeInTheDocument()
  })
})

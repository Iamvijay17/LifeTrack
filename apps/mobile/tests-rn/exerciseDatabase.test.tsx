import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mocks = { insert: jest.fn(async () => []) }
jest.mock('../src/lib/supabase', () => ({
  db: { list: async () => [], rpc: async () => null, insert: (...a: any[]) => (mocks.insert as any)(...a), update: async () => [], upsert: async () => [], remove: async () => {}, removeMany: async () => {} },
  supabase: null,
  authService: null,
}))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const catalogJson = require('fs').readFileSync(require('path').resolve(__dirname, '../../web/public/exercises/catalog.json'), 'utf8')
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }

const { ExerciseDatabase } = require('../src/features/fitness/ExerciseDatabase')
const { ExercisePickerField } = require('../src/features/fitness/ExercisePickerField')
const { ThemeProvider } = require('../src/providers/ThemeProvider')
const { queryClient } = require('../src/data/client')

// The web address is read when needed, so a test can point the build at a host (or at none) just before rendering.
function load(webUrl: string | undefined) {
  if (webUrl) process.env.EXPO_PUBLIC_WEB_URL = webUrl
  else delete process.env.EXPO_PUBLIC_WEB_URL
  const show = (library: any[] = []) => render(
    <SafeAreaProvider initialMetrics={metrics}><ThemeProvider><QueryClientProvider client={queryClient}><ExerciseDatabase library={library} /></QueryClientProvider></ThemeProvider></SafeAreaProvider>,
  )
  return { show }
}

afterEach(async () => { await cleanup(); mocks.insert.mockClear() })
afterAll(() => new Promise((done) => setTimeout(done, 1200)))

describe('ExerciseDatabase (mobile)', () => {
  beforeEach(() => { (global as any).fetch = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => { expect(url).toBe('https://lifetrack.example/exercises/catalog.json'); return JSON.parse(catalogJson) } })) })

  it('lists the database with category counts and the source credit, loading photos from the web host', async () => {
    const { show } = load('https://lifetrack.example/')
    await show()
    expect(await screen.findByText('876 exercises')).toBeTruthy()
    expect(screen.getByText('Cardio 14')).toBeTruthy()
    expect(screen.getByText(/Free Exercise DB — Unlicense/)).toBeTruthy()
    const imgs = screen.getAllByLabelText(/starting position/)
    expect(imgs).toHaveLength(24)
    expect(imgs[0].props.source.uri).toBe('https://lifetrack.example/exercises/3_4_Sit-Up/0.jpg')
    expect(imgs[0].props.resizeMode).toBe('contain') // never cropped or stretched
  })

  it('searches and filters', async () => {
    const { show } = load('https://lifetrack.example')
    await show()
    await screen.findByText('876 exercises')
    await fireEvent.press(screen.getByText('Cardio 14'))
    expect(screen.getByText('14 exercises')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'treadmill')
    expect(screen.getByText('3 exercises')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'zzzqq')
    expect(screen.getByText(/No exercises match/)).toBeTruthy()
  })

  it('opens an exercise with start and end photos and adds it in LifeTrack vocabulary', async () => {
    const { show } = load('https://lifetrack.example')
    await show()
    await screen.findByText('876 exercises')
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'plank')
    await fireEvent.press(screen.getAllByRole('button', { name: /^Plank, Abs/ })[0])
    expect(await screen.findByText('START')).toBeTruthy()
    expect(screen.getByText('END')).toBeTruthy()
    expect(screen.getByText(/Instructions/)).toBeTruthy()
    await fireEvent.press(screen.getByText('Add to my exercises'))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith('exercises', [{ name: 'Plank', muscle_group: 'Core', equipment: 'Bodyweight' }]))
  })

  it('shows an exercise already in your library as added, and an exercise with no photos gracefully', async () => {
    const { show } = load('https://lifetrack.example')
    await show([{ id: 'x', name: 'Plank' }])
    await screen.findByText('876 exercises')
    await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'kettlebell halo')
    await fireEvent.press(screen.getAllByRole('button', { name: /^Kettlebell Halo,/ })[0])
    expect(await screen.findByText('No demonstration images for this exercise')).toBeTruthy()
    expect(screen.queryByText('START')).toBeNull()
  })

  it('falls back to a placeholder when a photo cannot load', async () => {
    const { show } = load('https://lifetrack.example')
    await show()
    await screen.findByText('876 exercises')
    await fireEvent(screen.getAllByLabelText(/starting position/)[0], 'error')
    expect((await screen.findAllByText('Unavailable')).length).toBe(1)
    expect(screen.getAllByLabelText(/starting position/)).toHaveLength(23)
  })

  it('explains itself when the build has no web address, and offers retry when the file cannot be fetched', async () => {
    const a = load(undefined)
    await a.show()
    expect(await screen.findByText(/Set EXPO_PUBLIC_WEB_URL/)).toBeTruthy()
    await cleanup()
    ;(global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const b = load('https://broken.example')
    await b.show()
    expect(await screen.findByText(/Exercise database unavailable \(500\)/)).toBeTruthy()
    expect(screen.getByText('Try again')).toBeTruthy()
  })
})

describe('ExercisePickerField (workout form dropdown)', () => {
  const library = [{ id: 'a', name: 'Pushups', muscle_group: 'Chest', equipment: 'Bodyweight' }, { id: 'b', name: 'My custom move', muscle_group: 'Back', equipment: '' }]
  const showPicker = (onChange: any) => render(
    <SafeAreaProvider initialMetrics={metrics}><ThemeProvider><QueryClientProvider client={queryClient}><ExercisePickerField label="Exercise 1 (from library)" library={library} onChange={onChange} /></QueryClientProvider></ThemeProvider></SafeAreaProvider>,
  )
  beforeEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = 'https://lifetrack.example'
    ;(global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse(catalogJson) }))
  })

  it('opens a sheet of your exercises with photos, and choosing one fills the row', async () => {
    const onChange = jest.fn()
    await showPicker(onChange)
    expect(screen.queryByText('My custom move')).toBeNull() // closed until tapped
    await fireEvent.press(screen.getByRole('button', { name: /Exercise 1 \(from library\): none/ }))
    expect(await screen.findByText('My custom move')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByLabelText(/starting position/).length).toBeGreaterThan(0))
    expect(screen.getAllByLabelText('Pushups: starting position')[0].props.source.uri).toBe('https://lifetrack.example/exercises/Pushups/0.jpg')
    await fireEvent.press(screen.getByRole('button', { name: /^Pushups, Chest/ }))
    expect(onChange).toHaveBeenCalledWith('Pushups')
    await waitFor(() => expect(screen.queryByText('My custom move')).toBeNull()) // sheet closed
  })

  it('searches your exercises and the database, and still lists everything if the database cannot load', async () => {
    ;(global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    process.env.EXPO_PUBLIC_WEB_URL = 'https://offline.example'
    const onChange = jest.fn()
    await showPicker(onChange)
    await fireEvent.press(screen.getByRole('button', { name: /Exercise 1 \(from library\): none/ }))
    expect(await screen.findByText('Pushups')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Search'), 'zzzqq')
    expect(await screen.findByText(/No exercises match/)).toBeTruthy()
  })

  it('adds matches from the database as you type', async () => {
    const onChange = jest.fn()
    await showPicker(onChange)
    await fireEvent.press(screen.getByRole('button', { name: /Exercise 1 \(from library\): none/ }))
    await screen.findByText('Pushups')
    await fireEvent.changeText(screen.getByLabelText('Search'), 'treadmill')
    expect(await screen.findByText('From the exercise database')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: /^Running, Treadmill/ }))
    expect(onChange).toHaveBeenCalledWith('Running, Treadmill')
  })
})

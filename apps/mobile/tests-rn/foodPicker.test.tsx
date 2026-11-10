import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'

const mocks = { insert: jest.fn(async (_t: string, row: any) => [{ id: 'new', ...row }]) }
jest.mock('../src/lib/supabase', () => ({
  db: { list: async () => [], rpc: async () => null, insert: (...a: any[]) => (mocks.insert as any)(...a), update: async () => [], upsert: async () => [], remove: async () => {}, removeMany: async () => {} },
  supabase: null,
  authService: null,
}))
jest.mock('../src/lib/haptics', () => ({ haptics: { success: jest.fn(), tap: jest.fn(), warning: jest.fn() } }))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }
const { FoodPicker } = require('../src/features/nutrition/FoodPicker')
const { FoodForm } = require('../src/features/nutrition/FoodForm')
const { ThemeProvider } = require('../src/providers/ThemeProvider')
const { queryClient } = require('../src/data/client')
const { STARTER_FOODS } = require('@lifetrack/constants/foods')
const { buildCatalog } = require('@lifetrack/core/nutrition')

const catalog = buildCatalog([], STARTER_FOODS)
const wrap = (ui: any) => render(<SafeAreaProvider initialMetrics={metrics}><ThemeProvider><QueryClientProvider client={queryClient}>{ui}</QueryClientProvider></ThemeProvider></SafeAreaProvider>)
const picker = (props: any = {}) => wrap(<FoodPicker visible onClose={jest.fn()} catalog={catalog} favorites={[]} logs={[]} ctx={{ date: '2026-11-02', meal: 'lunch', time: '13:00' }} onToggleFavorite={jest.fn()} onManual={jest.fn()} onDetails={jest.fn()} {...props} />)

afterEach(async () => { await cleanup(); mocks.insert.mockClear() })
afterAll(() => new Promise((done) => setTimeout(done, 800)))

describe('FoodPicker (mobile): the expanded Indian food list', () => {
  it('finds foods by Tamil name and by another spelling', async () => {
    await picker()
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'தோசை')
    expect(screen.getByLabelText(/^Plain dosa, 133 calories/)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'briyani')
    expect(screen.getByLabelText(/^Chicken biryani, 620 calories/)).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'qzxwv')
    expect(screen.getByText('No match')).toBeTruthy()
  })

  it('lists the categories and pages a long list', async () => {
    await picker()
    for (const c of ['South Indian', 'Non-Vegetarian', 'Rice & Biryani', 'Street Food', 'Desserts', 'Protein Foods']) expect(screen.getByText(c)).toBeTruthy()
    expect(screen.getByText(/Show more \(/)).toBeTruthy()
  })

  it('shows how firm the number is and logs an exact weight with scaled nutrition', async () => {
    await picker()
    await fireEvent.changeText(screen.getByLabelText('Search foods'), 'chicken biryani')
    await fireEvent.press(screen.getByLabelText(/^Chicken biryani, 620 calories/))
    expect(screen.getByText('Rough estimate')).toBeTruthy()
    await fireEvent.press(screen.getByText('Custom weight'))
    await fireEvent.changeText(screen.getByLabelText('Amount in grams'), '175')
    expect(screen.getByText(/^310/)).toBeTruthy() // half of the 350 g plate
    await fireEvent.press(screen.getByText('Add to Lunch'))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith('food_logs', [expect.objectContaining({ name: 'Chicken biryani', serving_label: '175 g', quantity: 1, kcal: 310, meal_type: 'lunch' })]))
  })
})

describe('FoodForm (mobile): duplicates and other names', () => {
  it('refuses a name the list already has (including a Tamil or alternative spelling)', async () => {
    await wrap(<FoodForm visible food={null} catalog={catalog} categories={[]} onClose={jest.fn()} />)
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Thosai')
    await fireEvent.changeText(screen.getByLabelText('Calories'), '120')
    await fireEvent.press(screen.getByText('Save food'))
    expect(await screen.findByText(/"Plain dosa" is already in your food list/)).toBeTruthy()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('saves a new food with other names and a source note', async () => {
    await wrap(<FoodForm visible food={null} catalog={catalog} categories={[]} onClose={jest.fn()} />)
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Amma sambar')
    await fireEvent.changeText(screen.getByLabelText('Calories'), '70')
    await fireEvent.changeText(screen.getByLabelText('Other names (optional)'), 'அம்மா சாம்பார், home sambar')
    await fireEvent.changeText(screen.getByLabelText('Where are these numbers from? (optional)'), 'my recipe')
    await fireEvent.press(screen.getByText('Save food'))
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith('foods', [expect.objectContaining({ name: 'Amma sambar', aliases: ['அம்மா சாம்பார்', 'home sambar'], source: 'my recipe', kcal: 70 })]))
  })
})

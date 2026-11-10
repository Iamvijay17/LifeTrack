import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { pickOption } from './pickers'

const mocks = vi.hoisted(() => ({
  saveRow: vi.fn(),
  deleteRow: vi.fn(),
  logWater: vi.fn(),
  removeWaterLog: vi.fn(),
  saveNutritionGoals: vi.fn(),
  saveFavoriteFoods: vi.fn(),
  saveFoodCopy: vi.fn(),
  deleteFood: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
  tables: {},
}))
vi.mock('@/services/api', () => ({
  saveRow: mocks.saveRow,
  deleteRow: mocks.deleteRow,
  logWater: mocks.logWater,
  removeWaterLog: mocks.removeWaterLog,
  saveNutritionGoals: mocks.saveNutritionGoals,
  saveFavoriteFoods: mocks.saveFavoriteFoods,
  saveFoodCopy: mocks.saveFoodCopy,
  deleteFood: mocks.deleteFood,
}))
vi.mock('@/hooks/store', () => ({
  remove: mocks.remove,
  useTable: (t) => ({ rows: mocks.tables[t] ?? [] }),
  useTables: (...names) => ({
    data: Object.fromEntries(names.map((t) => [t, mocks.tables[t] ?? []])),
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/components/shared/Confirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({ settings: { water_goal_ml: 3000, timezone: 'Asia/Kolkata', week_starts_on: 1 } }),
}))
vi.mock('@/hooks/useToday', () => ({ useToday: () => '2026-11-02' }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { buildCatalog } from '@/domain/nutrition'
import { STARTER_FOODS } from '@lifetrack/constants/foods'
import { CalorieHero } from '@/features/nutrition/CalorieHero'
import { MealSection } from '@/features/nutrition/MealSection'
import { WaterCard } from '@/features/nutrition/WaterCard'
import { FoodPickerDialog } from '@/features/nutrition/FoodPickerDialog'
import { GoalsDialog } from '@/features/nutrition/GoalsDialog'
import { FoodEntryForm } from '@/features/nutrition/FoodEntryForm'
import { blankEntryValues } from '@/features/nutrition/FoodEntryFlow'
import NutritionPage from '@/features/nutrition/NutritionPage'

const DAY = '2026-11-02'
const E = (o) => ({
  id: 'e1',
  created_at: `${DAY}T08:00:00Z`,
  log_date: DAY,
  log_time: '08:15:00',
  meal_type: 'breakfast',
  name: 'Idli',
  category: 'Tiffin',
  food_id: null,
  base_key: 'idli',
  variant: '',
  quantity: 2,
  serving_label: '1 idli (40 g)',
  kcal: 116,
  protein_g: 4,
  carbs_g: 24,
  fat_g: 0.8,
  fiber_g: 1.2,
  notes: '',
  ...o,
})
const NO_GOALS = { kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null }
const GOALS = { kcal: 1800, protein_g: 90, carbs_g: 220, fat_g: 55, fiber_g: 30 }
const TOTALS = { kcal: 348, protein_g: 12, carbs_g: 72, fat_g: 2.4, fiber_g: 3.6 }

beforeEach(() => {
  for (const f of Object.values(mocks)) if (typeof f?.mockReset === 'function') f.mockReset()
  mocks.tables = {}
  mocks.saveRow.mockImplementation(async (_t, _e, v) => ({ id: 'new', ...v }))
  mocks.logWater.mockResolvedValue({})
  mocks.removeWaterLog.mockResolvedValue({})
  mocks.saveNutritionGoals.mockResolvedValue({})
  mocks.saveFavoriteFoods.mockResolvedValue({})
  mocks.confirm.mockResolvedValue(true)
})

describe('CalorieHero', () => {
  it('shows what is eaten, what is left and every nutrient against its goal', () => {
    render(<CalorieHero totals={TOTALS} goals={GOALS} isToday onEditGoals={() => {}} />)
    expect(screen.getByRole('img', { name: '348 of 1800 calories' })).toBeInTheDocument()
    expect(screen.getByText('Remaining today')).toBeInTheDocument()
    expect(screen.getByText(/1,452 kcal/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Protein today' })).toHaveAttribute('aria-valuenow', '13')
    expect(screen.getByText(/\/ 90 g/)).toBeInTheDocument()
  })
  it('says how far over the goal you are, instead of a negative number', () => {
    render(<CalorieHero totals={{ ...TOTALS, kcal: 2100 }} goals={GOALS} isToday onEditGoals={() => {}} />)
    expect(screen.getByText('Over your goal by')).toBeInTheDocument()
    expect(screen.getByText(/300 kcal/)).toBeInTheDocument()
  })
  it('without a goal it shows only what was eaten and offers to set targets (a missing goal is not 0%)', async () => {
    const edit = vi.fn()
    render(<CalorieHero totals={TOTALS} goals={NO_GOALS} isToday onEditGoals={edit} />)
    expect(screen.getByText('kcal eaten')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Protein today' })).toHaveAttribute('aria-valuenow', '0')
    await userEvent.click(screen.getByRole('button', { name: /set daily targets/i }))
    expect(edit).toHaveBeenCalled()
  })
})

describe('MealSection', () => {
  const meal = {
    id: 'breakfast',
    label: 'Breakfast',
    entries: [E()],
    totals: { kcal: 116, protein_g: 4, carbs_g: 24, fat_g: 0.8, fiber_g: 1.2 },
  }
  it('lists entries with quantity, serving, time and nutrition, and offers add / edit / duplicate / delete', async () => {
    const h = { onAdd: vi.fn(), onEdit: vi.fn(), onDuplicate: vi.fn(), onDelete: vi.fn() }
    const user = userEvent.setup()
    render(<MealSection meal={meal} {...h} />)
    expect(screen.getByText('2 × 1 idli (40 g) · 08:15')).toBeInTheDocument()
    expect(screen.getByText('116')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add food to Breakfast' }))
    expect(h.onAdd).toHaveBeenCalledWith('breakfast')
    await user.click(screen.getByRole('button', { name: 'Edit Idli' }))
    expect(h.onEdit).toHaveBeenCalledWith(meal.entries[0])
    await user.click(screen.getByRole('button', { name: 'Actions for Idli' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))
    expect(h.onDuplicate).toHaveBeenCalledWith(meal.entries[0])
    await user.click(screen.getByRole('button', { name: 'Actions for Idli' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(h.onDelete).toHaveBeenCalledWith(meal.entries[0])
  })
  it('an empty meal says so', () => {
    render(
      <MealSection
        meal={{ ...meal, entries: [], totals: { kcal: 0 } }}
        onAdd={() => {}}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    )
    expect(screen.getByText('Nothing logged')).toBeInTheDocument()
  })
})

describe('WaterCard', () => {
  const entry = { id: 'w1', log_date: DAY, log_time: '09:00:00', amount_ml: 250 }
  const day = { entries: [entry], total: 250, logged: 250, other: 0, last: entry }
  it('adds 250 / 500 ml and a custom amount; the custom Add stays disabled until the amount is valid', async () => {
    const user = userEvent.setup()
    render(
      <WaterCard
        day={{ entries: [], total: 0, logged: 0, other: 0, last: null }}
        goal={3000}
        date={DAY}
        today={DAY}
        nowTime={() => '10:30'}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add 250 millilitres' }))
    await waitFor(() => expect(mocks.logWater).toHaveBeenCalledWith(DAY, 250, '10:30'))
    await user.click(screen.getByRole('button', { name: 'Add 500 millilitres' }))
    await waitFor(() => expect(mocks.logWater).toHaveBeenLastCalledWith(DAY, 500, '10:30'))
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText('Custom amount in millilitres'), '5001')
    expect(add).toBeDisabled()
    await user.clear(screen.getByLabelText('Custom amount in millilitres'))
    await user.type(screen.getByLabelText('Custom amount in millilitres'), '330')
    await user.click(add)
    await waitFor(() => expect(mocks.logWater).toHaveBeenLastCalledWith(DAY, 330, '10:30'))
  })
  it('a past day gets no time stamp, undo removes the LAST entry, and deleting one asks first', async () => {
    const user = userEvent.setup()
    render(<WaterCard day={day} goal={3000} date="2026-11-01" today={DAY} nowTime={() => '10:30'} />)
    await user.click(screen.getByRole('button', { name: 'Add 250 millilitres' }))
    await waitFor(() => expect(mocks.logWater).toHaveBeenCalledWith('2026-11-01', 250, null))
    await user.click(screen.getByRole('button', { name: /undo last \(250 ml\)/i }))
    await waitFor(() => expect(mocks.removeWaterLog).toHaveBeenCalledWith(entry))
    mocks.removeWaterLog.mockClear()
    mocks.confirm.mockResolvedValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Delete 250 ml entry' }))
    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.removeWaterLog).not.toHaveBeenCalled() // cancelled
  })
  it('water typed in Sleep & Health is shown, so the list adds up to the total', () => {
    render(<WaterCard day={{ ...day, total: 1000, other: 750 }} goal={3000} date={DAY} today={DAY} nowTime={() => '10:30'} />)
    expect(screen.getByText(/750 ml logged in Sleep/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Water today' })).toHaveAttribute('aria-valuenow', '33')
  })
})

describe('food picker', () => {
  const catalog = buildCatalog([], STARTER_FOODS)
  const pickFirst = (user) => user.click(within(screen.getByRole('list', { name: 'Foods' })).getAllByRole('button')[0])
  const open = (props = {}) =>
    render(
      <FoodPickerDialog
        open
        onOpenChange={vi.fn()}
        catalog={catalog}
        favorites={[]}
        logs={[]}
        ctx={{ date: DAY, meal: 'breakfast', time: '08:00' }}
        onToggleFavorite={vi.fn()}
        onManual={vi.fn()}
        onDetails={vi.fn()}
        {...props}
      />,
    )
  it('searches by name and shows calories and macros in the results', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Search foods'), 'idli')
    const list = screen.getByRole('list', { name: 'Foods' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('58')).toBeInTheDocument()
    expect(within(list).getByText('P 2 · C 12 · F 0.4')).toBeInTheDocument()
  })
  it('shows an empty state with a way forward when nothing matches', async () => {
    const onManual = vi.fn()
    const user = userEvent.setup()
    open({ onManual })
    await user.type(screen.getByLabelText('Search foods'), 'zzzz')
    expect(screen.getByText('No match')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enter manually' }))
    expect(onManual).toHaveBeenCalledWith('zzzz')
  })
  it('filters by category and by favourites', async () => {
    const user = userEvent.setup()
    open({ favorites: ['starter:dal'] })
    await user.click(screen.getByRole('button', { name: 'Dairy' }))
    const names = within(screen.getByRole('list', { name: 'Foods' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(names.some((n) => n.includes('Paneer'))).toBe(true)
    expect(names.some((n) => n.includes('Idli'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(screen.getByRole('tab', { name: 'Favourites' }))
    expect(within(screen.getByRole('list', { name: 'Foods' })).getAllByRole('listitem')).toHaveLength(1)
  })
  it('calculates nutrition from serving size and quantity, then logs it to the chosen meal', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    open({ onOpenChange })
    await user.type(screen.getByLabelText('Search foods'), 'idli')
    await pickFirst(user)
    await user.click(screen.getByRole('button', { name: '3 idlis' }))
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'More' })) // 1 -> 2
    expect(screen.getByLabelText('Quantity')).toHaveValue('2')
    expect(screen.getByText('Protein 12 g · Carbs 72 g · Fat 2.4 g · Fibre 3.6 g')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Lunch' }))
    await user.click(screen.getByRole('button', { name: 'Add to Lunch' }))
    await waitFor(() => expect(mocks.saveRow).toHaveBeenCalledTimes(1))
    expect(mocks.saveRow).toHaveBeenCalledWith(
      'food_logs',
      null,
      expect.objectContaining({
        name: 'Idli',
        meal_type: 'lunch',
        log_date: DAY,
        log_time: '08:00',
        quantity: 2,
        serving_label: '3 idlis',
        kcal: 348,
        protein_g: 12,
        base_key: 'idli',
      }),
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
  it('a preparation variant changes the nutrition; an invalid quantity blocks adding', async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Search foods'), 'dosa')
    await pickFirst(user)
    await user.click(screen.getByRole('button', { name: 'Ghee roast' }))
    expect(screen.getByText('220')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '0')
    expect(screen.getByRole('button', { name: /add to breakfast/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /add to breakfast/i }))
    expect(mocks.saveRow).not.toHaveBeenCalled()
  })
  it('a double click adds the entry once', async () => {
    let finish
    mocks.saveRow.mockImplementation(() => new Promise((r) => (finish = r)))
    const user = userEvent.setup()
    open()
    await user.type(screen.getByLabelText('Search foods'), 'banana')
    await pickFirst(user)
    const add = screen.getByRole('button', { name: /add to breakfast/i })
    await user.dblClick(add)
    expect(mocks.saveRow).toHaveBeenCalledTimes(1)
    finish({ id: 'x', name: 'Banana', meal_type: 'breakfast' })
  })
})

describe('entry form', () => {
  const render_ = (props = {}) =>
    render(<FoodEntryForm open onOpenChange={vi.fn()} entry={null} values={blankEntryValues({ date: DAY, meal: 'lunch' })} {...props} />)
  it('validates before saving and keeps the form open with the error beside the field', async () => {
    const user = userEvent.setup()
    render_()
    await user.click(screen.getByRole('button', { name: /add to lunch/i }))
    expect(await screen.findByText('Name the food')).toBeInTheDocument()
    expect(mocks.saveRow).not.toHaveBeenCalled()
  })
  it('shows the total for the quantity live and stores totals, not per-serving values', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render_({ onOpenChange })
    await user.type(screen.getByLabelText('Food'), 'Homemade sambar')
    const quantity = screen.getByLabelText('Quantity')
    await user.clear(quantity)
    await user.type(quantity, '1.5')
    await user.type(screen.getByLabelText('Calories (kcal)'), '85')
    await user.type(screen.getByLabelText('Protein (g)'), '4')
    expect(screen.getByTestId('entry-totals')).toHaveTextContent('128 kcal in total')
    expect(screen.getByTestId('entry-totals')).toHaveTextContent('P 6 g')
    await user.click(screen.getByRole('button', { name: /add to lunch/i }))
    await waitFor(() => expect(mocks.saveRow).toHaveBeenCalled())
    expect(mocks.saveRow.mock.calls[0][1]).toBeNull() // a new entry
    expect(mocks.saveRow.mock.calls[0][2]).toMatchObject({
      name: 'Homemade sambar',
      meal_type: 'lunch',
      quantity: 1.5,
      kcal: 127.5,
      protein_g: 6,
      log_date: DAY,
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
  it('editing updates the same entry and keeps its food link', async () => {
    const user = userEvent.setup()
    const entry = E({ id: 'e9', food_id: '7b7a2f0e-0000-4000-8000-000000000000' })
    render_({
      entry,
      title: 'Edit food entry',
      values: {
        ...blankEntryValues({ date: DAY, meal: 'breakfast', name: 'Idli' }),
        kcal: '58',
        quantity: '2',
        food_id: entry.food_id,
        base_key: 'idli',
      },
    })
    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '3')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.saveRow).toHaveBeenCalled())
    expect(mocks.saveRow.mock.calls[0][1]).toBe(entry)
    expect(mocks.saveRow.mock.calls[0][2]).toMatchObject({ quantity: 3, kcal: 174, food_id: entry.food_id, base_key: 'idli' })
  })
  it('lets the meal and category be changed', async () => {
    const user = userEvent.setup()
    render_()
    await user.type(screen.getByLabelText('Food'), 'Tea')
    await user.type(screen.getByLabelText('Calories (kcal)'), '70')
    await user.click(screen.getByRole('tab', { name: 'Dinner' }))
    await pickOption(user, screen.getByLabelText('Category'), 'Beverages')
    await user.click(screen.getByRole('button', { name: /add to dinner/i }))
    await waitFor(() => expect(mocks.saveRow).toHaveBeenCalled())
    expect(mocks.saveRow.mock.calls[0][2]).toMatchObject({ meal_type: 'dinner', category: 'Beverages' })
  })
})

describe('goals dialog', () => {
  it('saves the targets, an empty one as "no goal", and the water goal beside them', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <GoalsDialog
        open
        onOpenChange={onOpenChange}
        settingsRow={{
          id: 'g',
          calorie_goal: 1800,
          protein_goal_g: null,
          carbs_goal_g: null,
          fat_goal_g: null,
          fiber_goal_g: null,
          updated_at: 'x',
        }}
      />,
    )
    expect(screen.getByLabelText('Calories (kcal)')).toHaveValue('1800')
    await user.clear(screen.getByLabelText('Calories (kcal)'))
    await user.type(screen.getByLabelText('Calories (kcal)'), '2000')
    await user.type(screen.getByLabelText('Protein (g)'), '80')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.saveNutritionGoals).toHaveBeenCalled())
    expect(mocks.saveNutritionGoals).toHaveBeenCalledWith(
      { calorie_goal: 2000, protein_goal_g: 80, carbs_goal_g: null, fat_goal_g: null, fiber_goal_g: null },
      3000,
    )
  })
  it('rejects out-of-range targets with a message', async () => {
    const user = userEvent.setup()
    render(<GoalsDialog open onOpenChange={vi.fn()} settingsRow={null} />)
    await user.type(screen.getByLabelText('Calories (kcal)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Calories: 500–10000/)).toBeInTheDocument()
    expect(mocks.saveNutritionGoals).not.toHaveBeenCalled()
  })
})

describe('Food & Nutrition page', () => {
  const page = () =>
    render(
      <MemoryRouter initialEntries={['/nutrition']}>
        <NutritionPage />
      </MemoryRouter>,
    )
  it('a brand-new account sees an empty state with the way to log a first meal, and all four meals once they have logged', async () => {
    page()
    expect(await screen.findByText('Log your first meal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /set daily targets/i })).toBeInTheDocument()
  })
  it("shows today's meals, totals and quick-add chips for foods eaten before", async () => {
    mocks.tables.food_logs = [
      E({ id: 'a' }),
      E({ id: 'b', log_date: '2026-11-01' }),
      E({ id: 'c', meal_type: 'lunch', name: 'Dal', base_key: 'dal', kcal: 160 }),
    ]
    mocks.tables.nutrition_settings = [
      { id: 'n', calorie_goal: 1800, protein_goal_g: 90, carbs_goal_g: null, fat_goal_g: null, fiber_goal_g: null, favorite_foods: [] },
    ]
    page()
    expect(await screen.findByTestId('meal-breakfast')).toHaveTextContent('Idli')
    expect(screen.getByTestId('meal-lunch')).toHaveTextContent('Dal')
    expect(screen.getByTestId('meal-dinner')).toHaveTextContent('Nothing logged')
    expect(screen.getByRole('img', { name: '276 of 1800 calories' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add idli again, 116 calories/i })).toBeInTheDocument() // eaten twice: frequent
    await userEvent.click(screen.getByRole('button', { name: /add idli again/i }))
    await waitFor(() => expect(mocks.saveRow).toHaveBeenCalled())
    expect(mocks.saveRow.mock.calls[0][2]).toMatchObject({ name: 'Idli', log_date: DAY, kcal: 116, quantity: 2 })
  })
  it('deleting an entry asks first and does nothing if you cancel', async () => {
    mocks.tables.food_logs = [E()]
    mocks.confirm.mockResolvedValue(false)
    const user = userEvent.setup()
    page()
    await user.click(await screen.findByRole('button', { name: 'Actions for Idli' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete this entry?' }))
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('switches between Today, Calendar, Analytics and Foods', async () => {
    mocks.tables.food_logs = [E(), E({ id: 'p', log_date: '2026-10-30', kcal: 500 })]
    const user = userEvent.setup()
    page()
    await screen.findByTestId('meal-breakfast')
    await user.click(screen.getByRole('tab', { name: 'Calendar' }))
    expect(await screen.findByText('Food calendar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 November, no food logged/ })).toBeInTheDocument() // after the first log, before today, nothing logged
    expect(screen.getByRole('button', { name: /2 November, 116 kilocalories/ })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Analytics' }))
    expect(await screen.findByText('Avg daily calories')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Weekly' }))
    expect(screen.getByText('Average daily calories per week')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Monthly' }))
    expect(screen.getByText('Calories per day')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Foods' }))
    expect(await screen.findByText(/approximate estimates/)).toBeInTheDocument()
    expect(screen.getAllByText('≈ estimate').length).toBeGreaterThan(10)
  })
})

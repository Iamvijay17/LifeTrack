import { describe, expect, it } from 'vitest'
import { dayTotals, entryRow, entryDraftFromFood, buildCatalog, servingOptions, waterDay } from '@lifetrack/core/nutrition'
import { STARTER_FOODS } from '@lifetrack/constants/foods'
import { foodLogFormSchema, foodLogFormToPayload, foodLogDraftToForm, nutritionGoalsFormSchema, nutritionGoalsToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02'
describe('nutrition flows (mobile data path)', () => {
  it('logs a picked food, edits it through the form, duplicates it and deletes it', async () => {
    const { store, tables } = setup()
    await store.load('food_logs')
    const food = buildCatalog([], STARTER_FOODS).find((f) => f.ref === 'starter:idli')!
    const draft = entryDraftFromFood(food, { serving: servingOptions(food)[1], quantity: 2, meal: 'breakfast', date: TODAY, time: '08:15' })
    const saved: any = await store.insert('food_logs', entryRow(draft))
    expect(tables.food_logs[0]).toMatchObject({ name: 'Idli', serving_label: '2 idlis', quantity: 2, kcal: 232, meal_type: 'breakfast' })
    // edit: the form works per serving, so changing the quantity rescales every nutrient
    const form = foodLogFormSchema.parse({ ...foodLogDraftToForm({ ...saved, quantity: 2, per: { kcal: 116, protein_g: 4, carbs_g: 24, fat_g: 0.8, fiber_g: 1.2 }, log_time: '08:15' }), quantity: '3' })
    await store.update('food_logs', saved.id, foodLogFormToPayload(form))
    expect(tables.food_logs[0]).toMatchObject({ quantity: 3, kcal: 348, protein_g: 12 })
    await store.insert('food_logs', { ...entryRow(draft), log_date: '2026-11-03' }) // duplicate to another day
    await store.refetch('food_logs')
    expect(dayTotals(store.peek('food_logs') as any, TODAY).kcal).toBe(348)
    expect(dayTotals(store.peek('food_logs') as any, '2026-11-03').kcal).toBe(232)
    await store.remove('food_logs', saved.id)
    expect(tables.food_logs).toHaveLength(1)
  })
  it('water: entries and the day total in health_logs move together, and undo takes the last drink back', async () => {
    const { store, api, tables } = setup()
    await store.load('water_logs'); await store.load('health_logs')
    await api.logWater(TODAY, 250, '09:00')
    const b: any = await api.logWater(TODAY, 500)
    expect(tables.health_logs[0].water_ml).toBe(750)
    expect(waterDay(store.peek('water_logs') as any, store.peek('health_logs')[0] as any, TODAY)).toMatchObject({ total: 750, other: 0 })
    await api.removeWaterLog(b)
    expect(tables.health_logs[0].water_ml).toBe(250)
    expect(store.peek('water_logs')).toHaveLength(1)
    await expect(api.logWater(TODAY, 6000)).rejects.toThrow()
  })
  it('targets save as null when empty; favourites and a starter-food copy are saved once', async () => {
    const { store, api, tables } = setup()
    await store.load('nutrition_settings'); await store.load('foods')
    await api.saveNutritionGoals(nutritionGoalsToPayload(nutritionGoalsFormSchema.parse({ calorie_goal: '1800', protein_goal_g: '', carbs_goal_g: '', fat_goal_g: '', fiber_goal_g: '', water_goal_ml: '' })).settings)
    await api.saveFavoriteFoods(['starter:dal'])
    expect(tables.nutrition_settings).toHaveLength(1)
    expect(tables.nutrition_settings[0]).toMatchObject({ calorie_goal: 1800, protein_goal_g: null, favorite_foods: ['starter:dal'] })
    await api.saveFoodCopy('dal', { name: 'Dal', kcal: 170 }); await api.saveFoodCopy('dal', { name: 'Dal', kcal: 175 })
    expect(tables.foods).toHaveLength(1)
    expect(tables.foods[0]).toMatchObject({ base_key: 'dal', kcal: 175 })
  })
})

import { describe, expect, it } from 'vitest'
import { STARTER_FOODS } from '../../constants/src/foods.js'
import { scaleNutrition } from '../../core/src/nutrition.js'
import {
  blankCustomFood, customFoodFormSchema, customFoodToForm, customFoodToPayload, foodLogDraftToForm, foodLogFormSchema, foodLogFormToPayload, foodLogFormTotals,
  insertSchemas, nutritionGoalsFormSchema, nutritionGoalsToForm, nutritionGoalsToPayload, parseServings, servingsToText, waterAmountSchema,
} from '../src'

const draft = { name: 'Idli', category: 'Tiffin', meal_type: 'breakfast' as const, log_date: '2026-11-02', quantity: 3, serving_label: '1 idli (40 g)', per: { kcal: 58, protein_g: 2, carbs_g: 12, fat_g: 0.4, fiber_g: 0.6 } }

describe('food entry form', () => {
  const form = foodLogDraftToForm(draft)
  it('maps a draft to text, validates, and stores whole-quantity totals as a valid row', () => {
    expect(form).toMatchObject({ name: 'Idli', quantity: '3', kcal: '58', fat_g: '0.4', log_time: '', food_id: '', base_key: '' })
    const v = foodLogFormSchema.parse(form)
    const p = foodLogFormToPayload(v)
    expect(p).toMatchObject({ kcal: 174, protein_g: 6, carbs_g: 36, fat_g: 1.2, fiber_g: 1.8, quantity: 3, log_time: null, food_id: null, base_key: null })
    expect(insertSchemas.food_logs.safeParse(p).success).toBe(true)
  })
  it('the form totals equal the shared calculation for awkward quantities', () => {
    for (const q of ['0.5', '1.25', '2.75', '7', '0.33']) {
      const t = foodLogFormTotals({ ...form, quantity: q })
      expect(t).toEqual(scaleNutrition(draft.per, Number(q)))
    }
  })
  it('rejects bad input with a message that names the field', () => {
    const bad = (o: object) => foodLogFormSchema.safeParse({ ...form, ...o })
    expect(bad({ name: '   ' }).success).toBe(false)
    expect(bad({ quantity: '0' }).success).toBe(false)
    expect(bad({ quantity: '-1' }).success).toBe(false)
    expect(bad({ quantity: '1001' }).success).toBe(false)
    expect(bad({ quantity: 'abc' }).success).toBe(false)
    expect(bad({ kcal: '' }).success).toBe(false)
    expect(bad({ kcal: '5001' }).success).toBe(false)
    expect(bad({ protein_g: '-3' }).success).toBe(false)
    expect(bad({ kcal: '4000', quantity: '6' }).success).toBe(false) // 24,000 kcal in total
    expect(bad({ log_date: '2026-02-30' }).success).toBe(false)
    expect(bad({ log_time: '9am' }).success).toBe(false)
    expect(bad({ meal_type: 'brunch' }).success).toBe(false)
    expect(bad({ notes: 'x'.repeat(301) }).success).toBe(false)
    expect(bad({ protein_g: '' }).success).toBe(true) // optional nutrients default to 0
  })
  it('an empty nutrient is stored as 0, and a linked food keeps its ids', () => {
    const p = foodLogFormToPayload(foodLogFormSchema.parse({ ...form, protein_g: '', food_id: '7b7a2f0e-0000-4000-8000-000000000000', base_key: 'idli', variant: 'Ragi idli', log_time: '08:15' }))
    expect(p).toMatchObject({ protein_g: 0, base_key: 'idli', variant: 'Ragi idli', log_time: '08:15' })
    expect(insertSchemas.food_logs.safeParse(p).success).toBe(true)
  })
})

describe('custom food form', () => {
  it('blank is invalid until named and given calories; a full one becomes a valid foods row', () => {
    expect(customFoodFormSchema.safeParse(blankCustomFood()).success).toBe(false)
    const v = customFoodFormSchema.parse({ ...blankCustomFood(), name: "Mom's sambar", kcal: '85', protein_g: '4', servings: '2 katoris = 2\n1 plate = 3.5' })
    const p = customFoodToPayload(v)
    expect(p).toMatchObject({ name: "Mom's sambar", kcal: 85, protein_g: 4, serving_g: null, servings: [{ label: '2 katoris', factor: 2 }, { label: '1 plate', factor: 3.5 }] })
    expect(insertSchemas.foods.safeParse(p).success).toBe(true)
  })
  it('parses serving sizes strictly and round-trips them', () => {
    expect(parseServings('2 idlis = 2').servings).toEqual([{ label: '2 idlis', factor: 2 }])
    for (const bad of ['2 idlis', '= 2', 'x = 0', 'x = -1', 'x = abc', 'x = 101']) expect(parseServings(bad).error, bad).toBeTruthy()
    expect(parseServings('\n  \n').servings).toEqual([])
    expect(parseServings(Array.from({ length: 13 }, (_, i) => `s${i} = 1`).join('\n')).error).toBeTruthy()
    expect(servingsToText(parseServings('a = 1.5\nb = 2').servings)).toBe('a = 1.5\nb = 2')
  })
  it('every starter food edits through the form into a payload the database accepts', () => {
    for (const f of STARTER_FOODS) {
      const row = { ...f, id: 'x' }
      const v = customFoodFormSchema.parse(customFoodToForm(row))
      const p = { ...customFoodToPayload(v), variants: f.variants, base_key: f.key }
      expect(insertSchemas.foods.safeParse(p).success, f.name).toBe(true)
      expect(p.kcal).toBe(f.kcal)
    }
  })
})

describe('goals and water forms', () => {
  it('goals are optional, ranged, and an empty one means no goal', () => {
    const empty = nutritionGoalsToForm(null, null)
    expect(nutritionGoalsFormSchema.safeParse(empty).success).toBe(true)
    expect(nutritionGoalsToPayload(nutritionGoalsFormSchema.parse(empty))).toEqual({ settings: { calorie_goal: null, protein_goal_g: null, carbs_goal_g: null, fat_goal_g: null, fiber_goal_g: null }, waterGoalMl: null })
    const p = nutritionGoalsToPayload(nutritionGoalsFormSchema.parse({ ...empty, calorie_goal: '1800', protein_goal_g: '90', water_goal_ml: '2500' }))
    expect(p).toMatchObject({ settings: { calorie_goal: 1800, protein_goal_g: 90 }, waterGoalMl: 2500 })
    expect(insertSchemas.nutrition_settings.safeParse(p.settings).success).toBe(true)
    for (const bad of [{ calorie_goal: '100' }, { calorie_goal: '20000' }, { calorie_goal: '1800.5' }, { protein_goal_g: '0' }, { water_goal_ml: '100' }, { fat_goal_g: 'x' }]) expect(nutritionGoalsFormSchema.safeParse({ ...empty, ...bad }).success, JSON.stringify(bad)).toBe(false)
    expect(nutritionGoalsToForm({ calorie_goal: 2000 }, 3000)).toMatchObject({ calorie_goal: '2000', protein_goal_g: '', water_goal_ml: '3000' })
  })
  it('water amounts are whole millilitres from 1 to 5000', () => {
    for (const ok of ['1', '250', '5000']) expect(waterAmountSchema.safeParse(ok).success).toBe(true)
    for (const bad of ['0', '5001', '-1', '2.5', '', 'abc']) expect(waterAmountSchema.safeParse(bad).success, bad).toBe(false)
    expect(insertSchemas.water_logs.safeParse({ log_date: '2026-11-02', amount_ml: 250 }).success).toBe(true)
    expect(insertSchemas.water_logs.safeParse({ log_date: '2026-11-02', amount_ml: 0 }).success).toBe(false)
  })
})

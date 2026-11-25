import { Copy, CopyPlus, ListChecks, Pencil, Plus, Salad, Target, UtensilsCrossed, Trash2 } from 'lucide-react'
import { MEALS, MEAL_LABEL } from '@lifetrack/core/nutrition'
import { SEPARATOR } from '@/components/context-menu/items'
import { bulkDelete, changeField, changeFields, copyDetails, count } from '@/components/context-menu/helpers'
import { fmtGrams } from '@/domain/nutrition'
import * as store from '@/hooks/store'

const mealItems = (current, apply) =>
  MEALS.map((m) => ({ label: m.label, radio: true, checked: current === m.id, onSelect: () => apply(m.id) }))

/** One logged food. `d`: { day, actions: { openAdd, openEdit, quickAdd }, select } */
export function entryItems(entry, d) {
  const move = (meal) => changeField('food_logs', entry, { meal_type: meal }, `Moved to ${MEAL_LABEL[meal]}`)
  return [
    { label: 'Edit entry', icon: Pencil, onSelect: () => d.actions.openEdit(entry) },
    { label: 'Duplicate', icon: CopyPlus, onSelect: () => d.actions.quickAdd(entry, d.day) }, // logs a copy and offers its own Undo
    { label: 'Change meal', icon: UtensilsCrossed, items: () => mealItems(entry.meal_type, move) },
    {
      label: `Add food to ${MEAL_LABEL[entry.meal_type]}`,
      icon: Plus,
      onSelect: () => d.actions.openAdd({ date: d.day, meal: entry.meal_type }),
    },
    {
      label: 'Copy entry',
      icon: Copy,
      onSelect: () =>
        copyDetails(entry.name, [
          ['Meal', MEAL_LABEL[entry.meal_type]],
          ['Serving', `${Number(entry.quantity)} × ${entry.serving_label}`],
          ['Calories', `${Math.round(entry.kcal)} kcal`],
          ['Protein', `${fmtGrams(entry.protein_g)} g`],
          ['Carbs', `${fmtGrams(entry.carbs_g)} g`],
          ['Fat', `${fmtGrams(entry.fat_g)} g`],
        ]),
    },
    { label: 'Select', icon: ListChecks, onSelect: () => d.select?.(entry.id) },
    SEPARATOR,
    {
      label: 'Delete entry',
      icon: Trash2,
      danger: true,
      confirm: { title: 'Delete this entry?', description: `${entry.name} · ${Math.round(entry.kcal)} kcal`, confirmLabel: 'Delete' },
      onSelect: async () => {
        await store.remove('food_logs', entry.id)
        return { message: 'Entry deleted' }
      },
    },
  ]
}

export function entryBulkItems(entries) {
  const apply = (meal) =>
    changeFields('food_logs', entries, { meal_type: meal }, `${count(entries.length, 'entry')} moved to ${MEAL_LABEL[meal]}`)
  return [
    { label: 'Change meal', icon: UtensilsCrossed, items: () => mealItems(null, apply) },
    SEPARATOR,
    bulkDelete(
      'food_logs',
      entries.map((e) => e.id),
      'entry',
    ),
  ]
}

/** A meal's card, away from its entries. */
export const mealSectionItems = (meal, { day, openAdd }) => [
  { label: `Add food to ${meal.label}`, icon: Plus, onSelect: () => openAdd({ date: day, meal: meal.id }) },
]

/** Empty space on Food & Nutrition. */
export const nutritionPageItems = ({ day, today, openAdd, openGoals, goToday }) => [
  { label: 'Log food', icon: Salad, onSelect: () => openAdd({ date: day }) },
  { label: 'Edit targets', icon: Target, onSelect: openGoals },
  { label: 'Back to today', icon: Plus, hidden: day === today, onSelect: goToday },
]

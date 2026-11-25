import { foodLogDraftToForm } from '@lifetrack/schemas'
import { FoodEntryForm } from './FoodEntryForm'
import { FoodPickerDialog } from './FoodPickerDialog'

/** The blank starting values for an entry typed from scratch. */
export const blankEntryValues = ({ date, meal, time = '', name = '' }) =>
  foodLogDraftToForm({
    name,
    category: 'Other',
    meal_type: meal,
    log_date: date,
    log_time: time,
    quantity: 1,
    serving_label: '1 serving',
    per: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  })

/**
 * Add / edit / duplicate a food entry. `flow` is null (closed), { mode: 'pick', date, meal } or { mode: 'form', entry, values, title }.
 * Picking a food can log it right away; "Add notes, date or time" and "Enter manually" continue in the full form.
 */
export function FoodEntryFlow({ flow, setFlow, n, today, nowTime, toggleFavorite, categories }) {
  const close = (o) => {
    if (!o) setFlow(null)
  }
  const pick = flow?.mode === 'pick' ? flow : null
  const form = flow?.mode === 'form' ? flow : null
  const ctx = pick
    ? { date: pick.date, meal: pick.meal, time: pick.date === today ? nowTime() : '' }
    : { date: today, meal: 'breakfast', time: '' }
  return (
    <>
      <FoodPickerDialog
        open={!!pick}
        onOpenChange={close}
        catalog={n.catalog}
        favorites={n.favorites}
        logs={n.logs}
        ctx={ctx}
        onToggleFavorite={toggleFavorite}
        onManual={(name) => setFlow({ mode: 'form', entry: null, title: 'Add food entry', values: blankEntryValues({ ...ctx, name }) })}
        onDetails={(draft) => setFlow({ mode: 'form', entry: null, title: 'Add food entry', values: foodLogDraftToForm(draft) })}
      />
      <FoodEntryForm
        open={!!form}
        onOpenChange={close}
        entry={form?.entry ?? null}
        values={form?.values ?? blankEntryValues({ date: today, meal: 'breakfast' })}
        title={form?.title}
        categories={categories}
      />
    </>
  )
}
